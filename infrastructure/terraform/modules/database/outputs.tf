output "endpoint" { value = aws_db_instance.main.endpoint }
output "port" { value = aws_db_instance.main.port }
output "database_name" { value = aws_db_instance.main.db_name }
output "username" { value = aws_db_instance.main.username }
output "password" {
  value     = random_password.master.result
  sensitive = true
}
output "connection_url" {
  value     = "postgres://${aws_db_instance.main.username}:${random_password.master.result}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}"
  sensitive = true
}
