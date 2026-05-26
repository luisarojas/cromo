output "identity_arn" { value = aws_ses_domain_identity.main.arn }
output "verification_token" { value = aws_ses_domain_identity.main.verification_token }
output "mail_from_domain" { value = aws_ses_domain_mail_from.main.mail_from_domain }
