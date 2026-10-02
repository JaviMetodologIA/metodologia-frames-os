# ADR 0007 · Aula y decks comerciales

Estado: aceptada para generación local de borradores. [METODOLOGIA]

La familia `aula` reúne clase inmersiva, masterclass, workbook, Lean Coffee, playbook,
playbook inmersivo, índice y módulo. `deck.immersive` conserva `deck-v1` y sus escenas;
su variante comercial solicita `renderer=frames-aula` y usa `frames-aula-v1` completo.
No se convierte una fuente Aula a `deck-v1`: esa conversión perdería campos editables,
temporizadores, prompts, piezas de módulo y versiones sin notas. [CÓDIGO]

El catálogo `registry/aula-capabilities.json` resuelve las dieciocho skills, su edición,
fuente, handler y árbol íntegro por hashes. El motor verifica el catálogo al ejecutar.
Un import explícito de paquetes portables mediante `scripts/sync-aula-packages.ts`
reconcilia el motor con sus copias autónomas; `--check` no escribe. [CÓDIGO]

La importación adapta únicamente dos superficies de metadata al host sucesor:
`LINEAGE.yml` resuelve sus autoridades al catálogo, esta ADR, la familia nativa y
el handler de Aula; `context.md` se genera desde nombre, formato y edición, con
rutas `skills/aula`, comandos CLI y gates de esa familia. Las referencias de
Frames ContentOS permanecen en el snapshot portable original; no se presentan
como comandos ejecutables del sucesor. La transformación es explícita, idempotente
y se calcula también en `--check`, antes de comparar hashes y sin escribir.
El catálogo liga los bytes adaptados. `SKILL.md`, motor, inputs, outputs y schemas
permanecen intactos; no hay conversión de campos ni pérdida de contenido. [CÓDIGO]

El bridge en `engine/aula/` ejecuta Python estándar en staging temporal confinado,
verifica plan, archivos y recibo, y devuelve bytes. Los handlers de dominio entregan
esos bytes exclusivamente mediante `ctx.write`. Un módulo conserva seis páginas,
índice, Markdown, manifiesto y recibo. Sus enlaces y hashes siguen verificables.
La aceptación vuelve a comprobar las dependencias del recibo para detectar cambios
en piezas vecinas. Los bancos remotos son opcionales; el flujo básico es offline.
[CÓDIGO]

Un índice puede declarar `assetFiles` en la fuente: nombres de HTML vecinos y sus
SHA-256. Solo esos archivos se leen y copian tras aprobación; se rechazan rutas que
escapen, symlinks, hashes diferentes y recursos remotos. El bridge agrega CSP sin
red a todas las páginas y vuelve a ligar los bytes resultantes al recibo. [CÓDIGO]

Dirección y especificación mantienen los gates humanos nativos. El deck comercial
agrega un intake aprobado en `outcome` con audiencia, problema, decisión, tipo, modo
y tres pilares fuera de `simple`; su especificación debe coincidir con ese intake.
Un score escrito por el host no aprueba un gate. La revisión `REVISE` exige un run
successor con fuente corregida y nuevas aprobaciones, preservando el historial.
`acceptance` autoriza aceptar la pieza; no autoriza publicar. [CONFIG]

MetodologIA es predeterminada. Marca blanca se activa por petición o fact explícito;
su perfil neutral no contiene logos ficticios. Identidades privadas permanecen
en fuentes externas autorizadas, fuera del repositorio. [METODOLOGIA]

Límites: cinco escenas originales, sin paridad con el banco interno de Amaris.
Office necesita dependencias opcionales y una plantilla compatible, y entrega texto
estático. Trainer conserva su familia y sus gates; Aula no altera su evaluación.
Jarvis permanece en fallback local. [CONFIG]

## Snapshot1.1.0

[METODOLOGIA] El mismo motor portable incluye núcleo32iconos/16escenas y fuentes locales autorizadas; bancos opcionales v1.1.0 amplían a256/160. La especificación nativa añade `aula-build-bindings-v1`, aprobada junto con la fuente: SHA del código y paquete, política en fuente, perfil, fuentes, assets seleccionados y companions HTML. Antes de render y aceptación se compara con el estado actual.

[METODOLOGIA] Autoría nueva: comercial8slides, académica13, con extensión explícita en brief; histórica íntegra. MetodologIA es predeterminada, marca blanca por petición. Clase inmersiva explícita prevalece sobre capacitación genérica; Trainer permanece separado. Las18skills están catalogadas y se regeneran desde el snapshot común, sin promoción de piezas humanas por tests.
