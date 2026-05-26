output "log_group_api" { value = aws_cloudwatch_log_group.api.name }
output "log_group_frontend" { value = aws_cloudwatch_log_group.frontend.name }
output "alerts_topic_arn" { value = aws_sns_topic.alerts.arn }
