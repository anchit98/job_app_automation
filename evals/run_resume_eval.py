"""Eval of JobApp OS resume tailoring (prompt v28, the active migration) on 20 synthetic JDs.
Measures: keyword coverage (port of scoreJdKeywordCoverage), deterministic number fabrication,
LLM-judged unsupported claims (stronger judge model), edit-conservativeness, word ceiling.
Needs OPENAI_API_KEY in env. Caches everything under evals/cache/.
APPROXIMATIONS (disclosed in EVALS.md): JDs are synthetic; JD keyword parsing is re-implemented with an LLM
call (the app's own parser was not run); section_budgets is a simplified master-reference listing.
"""
import json, os, re, sys, pathlib, urllib.request, collections, hashlib
HERE = pathlib.Path(__file__).resolve().parent; CACHE = HERE/"cache"; CACHE.mkdir(exist_ok=True)
REPO = HERE.parent
KEY = os.environ["OPENAI_API_KEY"]
GEN_MODEL = os.environ.get("GEN_MODEL","gpt-4.1-mini")      # app default per README
JUDGE_MODEL = os.environ.get("JUDGE_MODEL","gpt-4.1")

def chat(model, messages, json_mode=True, temperature=0.2, tag=""):
    h = hashlib.sha256((model+tag+json.dumps(messages)).encode()).hexdigest()[:20]
    f = CACHE/f"{h}.json"
    if f.exists(): return json.load(open(f))
    body = {"model":model,"messages":messages,"temperature":temperature}
    if json_mode: body["response_format"]={"type":"json_object"}
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
          headers={"Authorization":"Bearer "+KEY,"Content-Type":"application/json"})
    out = json.load(urllib.request.urlopen(req, timeout=180))["choices"][0]["message"]["content"]
    res = json.loads(out); json.dump(res, open(f,"w")); return res

master = json.load(open(REPO/"masterresume/anchit-master-resume.json"))
sql = open(REPO/"web/db/migrations/042_resume_prompt_v26.sql").read()
PROMPT = re.search(r"'resume',\s*28,\s*'(.*?)',\s*'\[\"master_resume_json", sql, re.S).group(1).replace("''","'")

# ---- 1. synthetic JDs
ARCH = ["AI Product Manager at an early-stage LLM startup (Bengaluru)","Senior PM, growth and monetisation at an Indian fintech","Product Manager, platform/internal tools at a large SaaS company",
 "Senior PM, consumer app personalisation at an Indian e-commerce company","AI PM, agents and workflow automation at a B2B enterprise software company","Product Manager, data and analytics products",
 "Technical PM for developer APIs / MCP integrations","Senior PM, payments at a fintech","PM, customer support automation (LLM chatbots) at a SaaS company","Product Manager, marketplace supply side",
 "Senior PM, B2B SaaS onboarding and activation","PM, search and recommendations at a media/streaming company","AI PM, evaluation and quality for generative AI features","PM, growth experimentation (A/B testing) at a consumer startup",
 "Senior PM, ad-tech / marketing technology","PM, enterprise workflow and RPA platform","Product Manager, healthtech consumer app","Senior PM, supply chain / logistics platform","PM, edtech learner engagement","Group PM, AI-native productivity product"]
f = HERE/"jds.json"
if f.exists(): JDS = json.load(open(f))
else:
    JDS=[]
    for a in ARCH:
        r = chat(GEN_MODEL,[{"role":"user","content":f"Write a realistic, specific 180-250 word job description for: {a}. Use a fictional company name. Include responsibilities, requirements, nice-to-haves and tools. Return JSON {{\"company\":str,\"role\":str,\"jd\":str}}."}],temperature=0.7,tag="jd")
        JDS.append(r)
    json.dump(JDS,open(f,"w"),indent=1)

# ---- 2. parse JD keywords
def parse_jd(jd):
    return chat(GEN_MODEL,[{"role":"user","content":"Extract from this job description JSON with keys must_have_keywords (<=10 short phrases), nice_to_have_keywords (<=6), tech_stack (<=8 tools), role (title). Phrases must literally appear or be near-verbatim.\n\n"+jd}],tag="parse")

def norm(t): return re.sub(r"\s+"," ",re.sub(r"[^a-z0-9+\-#/ ]"," ",t.lower())).strip()
def kw_in(kw,corpus):
    n=norm(kw)
    if not n: return True
    if n in corpus: return True
    toks=[t for t in n.split() if len(t)>2]
    if not toks: return True
    return sum(t in corpus for t in toks) >= -(-len(toks)*6//10)
def corpus_of(c): return norm(" ".join([c.get("headline","") or ""]+[b for r in c["experience"] for b in r["bullets"]]+[b for p in c["projects"] for b in p["bullets"]]+c["skills"]))
def dedupe(l):
    s=set();o=[]
    for x in l:
        k=norm(x)
        if k and k not in s: s.add(k);o.append(x)
    return o

# ---- 3. generation
def lines_of(c):
    return [("headline",c.get("headline",""))]+[(f"exp{i}.{j}",b) for i,r in enumerate(c["experience"]) for j,b in enumerate(r["bullets"])]+\
           [(f"proj{i}.{j}",b) for i,p in enumerate(c["projects"]) for j,b in enumerate(p["bullets"])]+[(f"skill{i}",s) for i,s in enumerate(c["skills"])]
M_LINES = dict(lines_of(master)); M_CORPUS = corpus_of(master)
M_WORDS = sum(len(v.split()) for k,v in M_LINES.items() if k!="headline")
budget = f"Tailorable word count (experience + projects + skills): {M_WORDS}. Ceiling 400. Master line word counts:\n"+"\n".join(f"{k}: {len(v.split())} words" for k,v in M_LINES.items())
def brief(p):
    must,nice,tech=p.get("must_have_keywords",[]),p.get("nice_to_have_keywords",[]),p.get("tech_stack",[])
    tg=dedupe(must+tech)
    return ("PRIMARY GOAL — include at least 70% of JD keywords (must-have + tech) by rewriting MASTER points.\n"
            f"Hard floor: at least {-(-len(tg)*7//10)} of {len(tg)} target keywords must appear.\n"
            "Only use keywords already grounded in MASTER (skills or bullets). Never invent unfamiliar tools/employers.\n\n"
            "Must-have:\n"+"\n".join("- "+k for k in must)+"\nNice-to-have:\n"+"\n".join("- "+k for k in nice)+"\nTech stack:\n"+"\n".join("- "+k for k in tech)+
            (f"\n\nTarget role title: {p.get('role','')}")), tg

rows=[]
for jd in JDS:
    p = parse_jd(jd["jd"]); b,targets = brief(p)
    prompt = PROMPT.replace("{{jd_keyword_brief}}",b).replace("{{section_budgets}}",budget).replace("{{master_resume_json}}",json.dumps({k:master[k] for k in ["headline","experience","projects","skills"]},indent=1,ensure_ascii=False)).replace("{{jd_content}}",jd["jd"])
    gen = chat(GEN_MODEL,[{"role":"user","content":prompt}],temperature=0.2,tag="gen")
    rows.append((jd,p,targets,gen))

# ---- 4. metrics
NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")
def nums(t): return {n.replace(",","").rstrip(".") for n in NUM.findall(t)}
M_NUMS = nums(" ".join(M_LINES.values()))
res=[]
for jd,p,targets,gen in rows:
    try: g_lines = dict(lines_of({"headline":gen.get("headline",""),"experience":gen["experience"],"projects":gen["projects"],"skills":gen["skills"]}))
    except Exception as e: res.append({"role":jd["role"],"error":str(e)}); continue
    gc = corpus_of({"headline":gen.get("headline",""),"experience":gen["experience"],"projects":gen["projects"],"skills":gen["skills"]})
    grounded=[k for k in targets if kw_in(k,M_CORPUS)]; matched=[k for k in targets if kw_in(k,gc)]
    req=min(-(-len(targets)*7//10), len(grounded))
    new_nums = nums(" ".join(v for k,v in g_lines.items())) - M_NUMS
    changed=[k for k,v in g_lines.items() if k in M_LINES and v.strip()!=M_LINES[k].strip()]
    words=sum(len(v.split()) for k,v in g_lines.items() if k!="headline")
    # LLM judge on every changed/new line
    to_check={k:v for k,v in g_lines.items() if k not in M_LINES or v.strip()!=M_LINES[k].strip()}
    j = chat(JUDGE_MODEL,[{"role":"user","content":
        "You audit a tailored resume against the candidate's MASTER resume for fabrication. For each GENERATED line, decide if every factual claim "
        "(tool, skill, metric, scope, ownership, title, outcome) is supported by MASTER. Rewording without new facts is supported. "
        "Return JSON {\"lines\":[{\"id\":str,\"supported\":bool,\"unsupported_claims\":[str],\"type\":\"invented_tool_or_skill|invented_metric|overstated_scope|title_change|other|none\"}]}.\n\n"
        f"MASTER:\n{json.dumps({k:master[k] for k in ['headline','experience','projects','skills']},ensure_ascii=False)}\n\nGENERATED LINES:\n{json.dumps(to_check,ensure_ascii=False)}"}],temperature=0,tag="judge")
    bad=[l for l in j.get("lines",[]) if not l.get("supported",True)]
    res.append({"role":jd["role"],"targets":len(targets),"matched":len(matched),"grounded":len(grounded),"required":req,
      "coverage":len(matched)/max(1,len(targets)),"passes_app_rule":len(matched)>=req,"coverage_of_grounded":(len([k for k in grounded if k in matched])/max(1,len(grounded))),
      "new_numbers":sorted(new_nums),"words":words,"over_400":words>400,"lines_changed":len(changed),"lines_total":len(g_lines)-1,
      "headline_words":(len(g_lines.get("headline","").split()), len(M_LINES["headline"].split())),
      "judge_checked":len(to_check),"judge_unsupported":len(bad),"bad":bad,"to_check":to_check})
json.dump(res,open(HERE/"results.json","w"),indent=1,ensure_ascii=False)

ok=[r for r in res if "error" not in r]; n=len(ok)
avg=lambda k: sum(r[k] for r in ok)/n
print(f"resumes scored: {n}/{len(res)}  gen={GEN_MODEL} judge={JUDGE_MODEL}")
print(f"keyword coverage (all targets): mean {avg('coverage'):.0%}; share reaching >=70%: {sum(r['coverage']>=0.7 for r in ok)/n:.0%}")
print(f"app rule passed (matched >= min(70%, grounded)): {sum(r['passes_app_rule'] for r in ok)}/{n}")
print(f"mean targets grounded in master: {sum(r['grounded']/max(1,r['targets']) for r in ok)/n:.0%}")
print(f"resumes with a number not in master: {sum(1 for r in ok if r['new_numbers'])}/{n}  {[ (r['role'][:25],r['new_numbers']) for r in ok if r['new_numbers']][:6]}")
print(f"over 400-word ceiling: {sum(r['over_400'] for r in ok)}/{n}; mean words {avg('words'):.0f}")
print(f"lines changed vs master: {sum(r['lines_changed'] for r in ok)/sum(r['lines_total'] for r in ok):.0%}")
tot=sum(r['judge_checked'] for r in ok); bad=sum(r['judge_unsupported'] for r in ok)
print(f"judge: {bad}/{tot} changed lines have an unsupported claim ({bad/max(1,tot):.0%}); resumes with >=1 unsupported line: {sum(1 for r in ok if r['judge_unsupported'])}/{n}")
tc=collections.Counter(l.get('type') for r in ok for l in r['bad']); print("types:",dict(tc))
print("\nExamples:")
for r in ok:
    for l in r['bad'][:1]: print(" -",r['role'][:35],"|",l.get('id'),"|",l.get('unsupported_claims'),"|",str(r['to_check'].get(l.get('id')))[:160])
