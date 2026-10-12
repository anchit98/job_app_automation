"""Measure real token usage per JobApp OS pipeline stage with the repo's own prompt templates (gpt-4.1-mini)."""
import json, os, re, urllib.request, statistics, pathlib
HERE=pathlib.Path(__file__).resolve().parent; REPO=HERE.parent
KEY=os.environ["OPENAI_API_KEY"]; MODEL="gpt-4.1-mini"
def call(prompt):
    req=urllib.request.Request("https://api.openai.com/v1/chat/completions",data=json.dumps({"model":MODEL,"messages":[{"role":"user","content":prompt}],"temperature":0.2,"response_format":{"type":"json_object"}}).encode(),headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json"})
    d=json.load(urllib.request.urlopen(req,timeout=180)); u=d["usage"]; return json.loads(d["choices"][0]["message"]["content"]),u["prompt_tokens"],u["completion_tokens"]
master=json.load(open(REPO/"masterresume/anchit-master-resume.json"))
M=json.dumps({k:master[k] for k in ["headline","experience","projects","skills"]},indent=1,ensure_ascii=False)
tpl={t["id"]:t for t in json.load(open(REPO/"web/scripts/_prompt_templates.json"))}
sql=open(REPO/"web/db/migrations/042_resume_prompt_v26.sql").read()
RES=re.search(r"'resume',\s*28,\s*'(.*?)',\s*'\[\"master_resume_json",sql,re.S).group(1).replace("''","'")
jds=json.load(open(HERE/"jds.json"))[:6]
rows={"jd_parse":[],"resume":[],"cover_letter":[],"cold_email_3_contacts":[]}
for jd in jds:
    p,i,o=call("Extract JSON with keys must_have_keywords, nice_to_have_keywords, tech_stack, role, responsibilities, requirements from this job description:\n\n"+jd["jd"]); rows["jd_parse"].append((i,o))
    brief="Must-have:\n"+"\n".join("- "+k for k in p.get("must_have_keywords",[]))+"\nTech:\n"+"\n".join("- "+k for k in p.get("tech_stack",[]))
    r,i,o=call(RES.replace("{{jd_keyword_brief}}",brief).replace("{{section_budgets}}","Tailorable words: 452").replace("{{master_resume_json}}",M).replace("{{jd_content}}",jd["jd"])); rows["resume"].append((i,o))
    cl=tpl["cover_letter_v3"]["body"]
    for k,v in {"user_profile_json":json.dumps({"name":"Anchit Boruah","location":"Bengaluru"}),"target_company":jd["company"],"target_role":jd["role"],"jd_content":jd["jd"],"company_blurb_block":"","tailored_resume_json":json.dumps(r,ensure_ascii=False)}.items(): cl=cl.replace("{{"+k+"}}",v)
    _,i,o=call(cl); rows["cover_letter"].append((i,o))
    ce=tpl["cold_email_batch_v2"]["body"]
    contacts=[{"contact_id":f"c{n}","name":nm,"role_template":rt} for n,(nm,rt) in enumerate([("Asha","recruiter"),("Ravi","hiring_manager"),("Meera","director_product")])]
    for k,v in {"user_profile_json":json.dumps({"name":"Anchit Boruah"}),"target_company":jd["company"],"target_role":jd["role"],"jd_content":jd["jd"],"tailored_resume_json":json.dumps(r,ensure_ascii=False),"shared_context":"none","contacts_json":json.dumps(contacts)}.items(): ce=ce.replace("{{"+k+"}}",v)
    _,i,o=call(ce); rows["cold_email_3_contacts"].append((i,o))
out={}
for k,v in rows.items(): out[k]={"n":len(v),"input_tokens_mean":statistics.mean(x[0] for x in v),"output_tokens_mean":statistics.mean(x[1] for x in v),"input_max":max(x[0] for x in v),"output_max":max(x[1] for x in v)}
json.dump(out,open(HERE/"token_usage.json","w"),indent=1); print(json.dumps(out,indent=1))
