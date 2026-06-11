output "queue_url" {
  value       = aws_sqs_queue.ses_events.id
  description = "Long-polling URL the backend reads from."
}

output "queue_arn" {
  value = aws_sqs_queue.ses_events.arn
}

output "dlq_url" {
  value = aws_sqs_queue.ses_events_dlq.id
}
