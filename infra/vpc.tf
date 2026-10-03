# Network for the backend.
#
# Two AZs, each with a public and a private subnet. The Lambda and RDS both live
# in the private subnets.
#
# Egress is IPv6-only, through an egress-only internet gateway. That is what lets
# this stack skip a NAT gateway: a VPC-attached Lambda has no route to the
# internet on its own, and the usual fix costs ~$32/month in hourly charges
# alone. An egress-only gateway is free, allows outbound connections while
# blocking inbound ones, and both public APIs the backend calls publish AAAA
# records:
#
#   api.scryfall.com   2606:4700:10::6814:238e   (Cloudflare)
#   api.anthropic.com  2607:6bc0::10
#
# The trade-off is a hard dependency on those two staying IPv6-reachable. See
# README.md ("Egress without a NAT gateway") for the fallback if that ever breaks.
#
# RDS is reached over IPv4 inside the VPC, which is local routing and needs no
# gateway of any kind.

resource "aws_vpc" "main" {
  cidr_block                       = var.vpc_cidr
  assign_generated_ipv6_cidr_block = true
  enable_dns_support               = true
  enable_dns_hostnames             = true

  tags = { Name = "${local.name}-vpc" }
}

# Kept for inbound IPv4 if you ever add something public-facing (a bastion to
# reach RDS with psql, an ALB). Internet gateways, subnets and route tables are
# all free; nothing in this stack currently routes through it.
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-igw" }
}

# Outbound-only IPv6. The AWS-side equivalent of a NAT gateway for IPv6, with no
# hourly or per-GB charge.
resource "aws_egress_only_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-eigw" }
}

resource "aws_subnet" "public" {
  count = length(local.azs)

  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)
  ipv6_cidr_block   = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, count.index)

  tags = { Name = "${local.name}-public-${local.azs[count.index]}" }
}

resource "aws_subnet" "private" {
  count = length(local.azs)

  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + length(local.azs))
  ipv6_cidr_block   = cidrsubnet(aws_vpc.main.ipv6_cidr_block, 8, count.index + length(local.azs))

  # Lambda ENIs need an IPv6 address to use the egress-only gateway.
  assign_ipv6_address_on_creation = true

  tags = { Name = "${local.name}-private-${local.azs[count.index]}" }
}

# --- Routing --------------------------------------------------------------

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  route {
    ipv6_cidr_block = "::/0"
    gateway_id      = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# No 0.0.0.0/0 route: the private subnets have no IPv4 path off the VPC at all.
# Outbound traffic to Scryfall and Anthropic leaves over IPv6.
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    ipv6_cidr_block        = "::/0"
    egress_only_gateway_id = aws_egress_only_internet_gateway.main.id
  }

  tags = { Name = "${local.name}-private-rt" }
}

resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# --- Security groups ------------------------------------------------------

resource "aws_security_group" "lambda" {
  name        = "${local.name}-lambda-sg"
  description = "Lambda functions for the MTG Manager backend"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name}-lambda-sg" }
}

# Outbound only. HTTPS over IPv6 is the path that actually carries Scryfall and
# Anthropic traffic; the IPv4 rule costs nothing and keeps the SG from being the
# thing that breaks if a NAT is ever reintroduced.
resource "aws_vpc_security_group_egress_rule" "lambda_https_ipv6" {
  security_group_id = aws_security_group.lambda.id
  description       = "HTTPS over IPv6 to Scryfall and Anthropic"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv6         = "::/0"
}

resource "aws_vpc_security_group_egress_rule" "lambda_https_ipv4" {
  security_group_id = aws_security_group.lambda.id
  description       = "HTTPS over IPv4 (unused while egress is IPv6-only)"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "lambda_postgres" {
  security_group_id            = aws_security_group.lambda.id
  description                  = "Postgres to RDS over IPv4 inside the VPC"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.rds.id
}

resource "aws_security_group" "rds" {
  name        = "${local.name}-rds-sg"
  description = "RDS Postgres for the MTG Manager backend"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name}-rds-sg" }
}

# The only way in is from the Lambda security group. There is no public endpoint
# and no CIDR-based rule, so nothing on the internet can reach the database.
resource "aws_vpc_security_group_ingress_rule" "rds_from_lambda" {
  security_group_id            = aws_security_group.rds.id
  description                  = "Postgres from the backend Lambda functions"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.lambda.id
}
