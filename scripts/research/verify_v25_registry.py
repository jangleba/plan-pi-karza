"""Local integrity checks for the delivered evidence register; no quality score is inferred."""
import json, pathlib, sys
root=pathlib.Path(__file__).resolve().parents[2]
p=json.loads((root/'research/v25/evidence-registry.json').read_text())
rows=p['primary']
assert len(rows)==100 and len({r['pmid'] for r in rows})==100
assert len({r['doi'].lower() for r in rows})==100
assert len({r['id'] for r in rows})==100
for r in rows:
 assert r['first_publication_date']<=p['as_of']
 assert r['population_and_design_pl'] and r['findings_and_limitations_pl']
 assert r['source_url']==f"https://pubmed.ncbi.nlm.nih.gov/{r['pmid']}/"
 assert not any(s in r['title'].lower() for s in ['systematic review','meta-analysis','retraction'])
print('PASS: 100 unique primary publications; 100 PMID/DOI pairs; dated before cutoff; individual appraisals present.')
print('Scope: metadata/abstract appraisal, not 100 full-text risk-of-bias assessments or 100 independent cohorts.')
