output "identity_arn" { value = aws_ses_domain_identity.main.arn }
output "verification_token" { value = aws_ses_domain_identity.main.verification_token }
output "mail_from_domain" { value = aws_ses_domain_mail_from.main.mail_from_domain }
output "bounce_topic_arn" { value = aws_sns_topic.ses_bounces.arn }
output "complaint_topic_arn" { value = aws_sns_topic.ses_complaints.arn }
output "configuration_set_name" { value = aws_sesv2_configuration_set.main.configuration_set_name }
