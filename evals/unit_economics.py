import json
u=json.load(open("token_usage.json"))
IN,OUT=0.40,1.60            # USD per 1M tokens, gpt-4.1-mini list price (aggregator-reported; verify on OpenAI's page)
FX=88.0                     # INR per USD: ASSUMPTION, update to today's rate
RZP=0.0236                  # 2% + 18% GST on the fee, domestic UPI/cards (Razorpay published rate; verify)
def cost(stages, key="mean"):
    i=sum(u[s]["input_tokens_mean" if key=="mean" else "input_max"] for s in stages)
    o=sum(u[s]["output_tokens_mean" if key=="mean" else "output_max"] for s in stages)
    return (i*IN+o*OUT)/1e6, i, o
full=["jd_parse","resume","cover_letter","cold_email_3_contacts"]
lean=["jd_parse","resume"]
for name,st in [("resume only (jd parse + resume)",lean),("full quick-apply (resume+cover+3 emails)",full)]:
    c,i,o=cost(st); cm,_,_=cost(st,"max")
    print(f"{name}: {i:.0f} in / {o:.0f} out tokens -> ${c:.4f} = Rs {c*FX:.2f}  (worst observed ${cm:.4f} = Rs {cm*FX:.2f})")
c,_,_=cost(full)
for apps in (60,):
    for mult,label in [(1,"base"),(2,"2x for retries/longer JDs"),(5,"5x stress / pricier model")]:
        v=c*FX*apps*mult
        for price in (299,699):
            net=price*(1-RZP)
            print(f"{apps} apps {label:28s} variable LLM cost Rs {v:6.1f} | price Rs {price} -> net of gateway Rs {net:6.1f} -> contribution Rs {net-v:6.1f} ({(net-v)/price:.0%} of price)")
print("break-even apps at Rs299 net:", round((299*(1-RZP))/(c*FX)))
