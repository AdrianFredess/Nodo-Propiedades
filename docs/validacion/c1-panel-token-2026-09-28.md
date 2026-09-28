# C1 — Token en los webhooks del panel

El valor del token no está en este archivo.

- GET `/webhook/panel-leads` sin header: **401** {"ok":false,"error":"unauthorized"}
- GET `/webhook/panel-leads` con token incorrecto: **401**
- GET `/webhook/panel-leads` con `X-Panel-Token`: **200**
- POST `/webhook/panel-realtime-emit` sin header: **401** {"ok":false,"error":"unauthorized"}
- POST `/webhook/panel-realtime-emit` con `X-Panel-Token`: **200**
