# Security screenshots

The following images were captured from actual execution:

- P2-Browser-Sanitised-Gig.png
- P2-Browser-Role-Denied.png
- P2-ZAP-Report.png

The existing group Postman screenshots remain in the repository's `screenshots` folder.
The role-denied screenshot intentionally shows a forged browser role label. The account
is still a client in MongoDB; the server rejects its read and create attempts. This demonstrates
why browser role values cannot grant API permissions.
The optional additional captures below can provide more detail during review.

Capture the response status and result from the live local demo. Keep actual tokens,
passwords, environment values, private keys and unrelated personal windows out of view.

- P2-Role-Denied-403.png
- P2-Ownership-Denied-404.png
- P2-Invalid-JWT-401.png
- P2-Sanitised-Text-201.png
- P2-Security-Headers.png
- P2-Booking-Rate-Limit-429.png
- P2-Login-Rate-Limit-429.png
- P2-Node-Tests-Passed.png
- P2-Newman-Tests-Passed.png
- P2-ZAP-Report.png

Capture any additional images from actual execution; do not replace them with fabricated responses.
