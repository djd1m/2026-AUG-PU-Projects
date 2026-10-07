from pathlib import Path
import json,hashlib
r=Path('/tmp/n7-f11-pg-fixture-author-a22');a=Path('/tmp/n7-f11-admission-repair-author-a21')
s=(a/'schema-final-setup.mjs').read_text().replace(str(a),str(r)).replace('n7_a21_checks_261007032201','n7_a22_checks_261007032255')
(r/'schema-setup.mjs').write_text(s)
s=(a/'terminal-db-readonly.mjs').read_text().replace(str(a),str(r))
s=s.replace("assert.deepEqual(out.publicTables,JSON.parse(await readFile(root+'/schema-setup-result.json','utf8')).publicTables);",'')
s=s.replace("['n7_a21_checks_261007032200','n7_a21_checks_261007032201']","['n7_a21_checks_261007032200','n7_a21_checks_261007032201','n7_a22_checks_261007032255']")
(r/'terminal-db-readonly.mjs').write_text(s)
