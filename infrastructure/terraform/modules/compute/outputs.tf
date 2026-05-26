output "alb_dns_name" { value = aws_lb.main.dns_name }
output "alb_zone_id" { value = aws_lb.main.zone_id }
output "alb_arn_suffix" { value = aws_lb.main.arn_suffix }
output "asg_name" { value = aws_autoscaling_group.app.name }
output "iam_role_arn" { value = aws_iam_role.app.arn }
