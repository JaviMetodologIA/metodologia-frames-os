# skill-review-report-v1

Escribe un JSON con esta forma; el motor lo valida contra su schema al correr `next`.
Ejemplo válido (caso `verify/parity/cases/skills.build/frames-os/skill-review-report-v1.json`):

```json
{
  "schema_version": "skill-review-report-v1",
  "review_id": "REV-PROPUESTAS",
  "candidate_sha256": "SHA_DEL_CANDIDATO",
  "verdict": "PASS",
  "findings": [],
  "owner_component": "SKILL-REVISOR",
  "reviewer_actor_id": "revisor-independiente"
}
```
