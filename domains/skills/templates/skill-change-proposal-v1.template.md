# skill-change-proposal-v1

Escribe un JSON con esta forma; el motor lo valida contra su schema al correr `next`.
Ejemplo válido (caso `verify/parity/cases/skills.build/frames-os/skill-change-proposal-v1.json`):

```json
{
  "schema_version": "skill-change-proposal-v1",
  "proposal_id": "PROP-PROPUESTAS",
  "parent_id": null,
  "candidate_sha256": "SHA_DEL_CANDIDATO",
  "action": "CREATE",
  "migration_ref": null,
  "rollback_ref": "artifacts/restore-plan.md",
  "review_id": "REV-PROPUESTAS",
  "owner": "consultor"
}
```
