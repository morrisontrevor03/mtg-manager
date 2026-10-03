# RDS Postgres, private to the VPC.

resource "aws_db_subnet_group" "main" {
  name        = "${local.name}-db-subnets"
  description = "Private subnets for the MTG Manager database"
  subnet_ids  = aws_subnet.private[*].id

  tags = { Name = "${local.name}-db-subnets" }
}

resource "random_password" "db" {
  length = 32
  # RDS rejects '/', '@', '"' and space in a master password, and the value also
  # has to survive being embedded in a connection URL.
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_db_parameter_group" "main" {
  name_prefix = "${local.name}-pg"
  family      = "postgres${var.db_engine_version}"
  description = "MTG Manager Postgres parameters"

  # Log slow queries; useful when a Scryfall-heavy import feels sluggish.
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "main" {
  identifier = "${local.name}-db"

  engine                      = "postgres"
  engine_version              = var.db_engine_version
  allow_major_version_upgrade = false
  auto_minor_version_upgrade  = true
  instance_class              = var.db_instance_class

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result
  port     = 5432

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.main.name

  # No public endpoint: reachable only from the Lambda security group.
  publicly_accessible = false
  multi_az            = var.db_multi_az

  backup_retention_period = var.db_backup_retention_days
  backup_window           = "04:00-05:00"
  maintenance_window      = "sun:05:30-sun:06:30"
  copy_tags_to_snapshot   = true

  performance_insights_enabled    = false
  enabled_cloudwatch_logs_exports = ["postgresql"]

  deletion_protection = var.db_deletion_protection
  # A personal app with reproducible data; flip both of these for anything
  # whose loss would hurt.
  skip_final_snapshot       = !var.db_deletion_protection
  final_snapshot_identifier = var.db_deletion_protection ? "${local.name}-final" : null

  apply_immediately = true

  tags = { Name = "${local.name}-db" }
}

locals {
  # Prisma connection URL.
  #
  # `connection_limit=1` is the important part: every warm Lambda instance owns
  # its own pool, so a default pool of (2 * cores + 1) would multiply by
  # concurrency and exhaust db.t4g.micro's ~110 connections. One connection per
  # instance, bounded by lambda_reserved_concurrency, keeps that arithmetic safe.
  database_url = join("", [
    "postgresql://",
    var.db_username,
    ":",
    urlencode(random_password.db.result),
    "@",
    aws_db_instance.main.address,
    ":",
    tostring(aws_db_instance.main.port),
    "/",
    var.db_name,
    "?sslmode=require&connection_limit=1&pool_timeout=20&connect_timeout=10",
  ])
}

# Stored so you can retrieve the URL later (for a Next.js server, a psql session
# over a bastion, or a rotation) without reading Terraform state.
resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name}/database-url"
  description             = "Prisma connection URL for the MTG Manager database"
  recovery_window_in_days = 0

  tags = { Name = "${local.name}-database-url" }
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = jsonencode({
    url      = local.database_url
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    database = var.db_name
    username = var.db_username
    password = random_password.db.result
  })
}
