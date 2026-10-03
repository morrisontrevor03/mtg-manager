output "state_bucket" {
  description = "Set as the TF_STATE_BUCKET repository variable, and pass to `terraform init -backend-config`."
  value       = aws_s3_bucket.state.bucket
}

output "plan_role_arn" {
  description = "Set as the AWS_PLAN_ROLE_ARN repository variable."
  value       = aws_iam_role.plan.arn
}

output "apply_role_arn" {
  description = "Set as the AWS_APPLY_ROLE_ARN repository variable."
  value       = aws_iam_role.apply.arn
}
