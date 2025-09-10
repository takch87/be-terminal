#!/bin/bash

# Simular webhook de Stripe para transacción fallida
curl -X POST http://localhost:3002/webhooks/stripe \
  -H "Content-Type: application/json" \
  -d '{
    "id": "evt_test_webhook",
    "object": "event",
    "type": "payment_intent.payment_failed",
    "data": {
      "object": {
        "id": "pi_test_failed_payment",
        "object": "payment_intent",
        "amount": 2000,
        "currency": "usd",
        "status": "requires_payment_method",
        "metadata": {
          "event_code": "test-card-declined",
          "user_id": "8"
        },
        "last_payment_error": {
          "code": "card_declined",
          "decline_code": "generic_decline",
          "message": "Your card was declined.",
          "payment_method": {
            "card": {
              "brand": "visa",
              "last4": "4242"
            }
          }
        }
      }
    }
  }'
