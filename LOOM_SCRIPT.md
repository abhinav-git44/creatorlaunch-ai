# Loom walkthrough script (target: 7–8 minutes)

**Setup before recording:** live site open on your phone, mirrored or using Chrome DevTools phone mode at 390px. A second tab has the decision doc. Clear site data so you start fresh.

---

**0:00 – 0:40 · The problem**
"SuperProfile's hardest moment is the first one: a creator signs up, sees an empty store and stalls. Not because building a store is hard, but because they have to decide three things they've never decided: what to sell, what to charge and what to write. So I built something that makes those three decisions for them, and leaves them one job: adjust and publish."

**0:40 – 2:00 · Create (real AI call)**
- Show the single form. "Description first. Instagram is optional, and I'll explain why."
- Click **Use my Instagram** and point at the note: "We don't scrape. It's against Instagram's terms and it breaks. The username becomes the store link and an Instagram button, and the AI is told it has no profile data, so it never invents followers or testimonials."
- Switch back. Type a real description, e.g. *"Main SSC CGL ki tayari karwati hoon, daily maths tricks ke Reels banati hoon, Hindi medium students ke liye"*. Pick **Exam prep**, **20K–100K**, **Hinglish**.
- Tap **Generate my store**. While it loads: "One AI call, structured JSON, validated on the server before it reaches the screen."

**2:00 – 3:45 · Editor: what came back and why**
- Walk through the products: "Different formats, and always one cheap entry product, because price-sensitive followers buy on impulse first."
- Point at **Why ₹499?**: "Each price comes with a reason, and stays inside a fixed range for its format and snaps to familiar price points. LLMs on their own suggest things like ₹523 or ₹20,000 for an ebook."
- Change a price, and point at the **Saved** status.
- Tap **↻ New idea** on one product and type "something live". "Only that product changes; my edits elsewhere are kept." Show **Undo** in the toast.
- Tap **Rewrite with AI** on the profile.
- Switch the theme to **Elegant** and open **Preview**.

**3:45 – 4:45 · Publish and share**
- Tap **Publish**, show the suggested link, and publish.
- Show the success sheet: copy, WhatsApp, native share.
- Open the link in a private window: "Server-rendered, fast on a phone, a proper link preview on WhatsApp." Tap **Buy**: "No checkout in the prototype, but the button explains that instead of being a dead end."

**4:45 – 5:45 · Edge cases (show at least one live)**
- Back on the create page, type `asdfgh qwerty` → caught before any AI call, with an example of what to write.
- Type `I make content` → the AI asks one clarifying question instead of producing a vague store. Show "Use this draft" as the escape hatch.
- Mention what the tests cover: AI timeout, rate limit, malformed JSON, schema failures, slug collisions, invalid edits never overwriting saved data. "The creator never sees a broken page, and a failed regeneration can't damage saved work."

**5:45 – 7:15 · Decisions (decision doc on screen)**
- Flow diagram, plus the rejected main screen (tap-to-edit on the page) and why.
- What I didn't build: checkout, accounts, scraping, AI images.
- Metrics: first-session publish rate +30% relative in a 50/50 test; median time to publish under 10 minutes; first-sale rate as the guardrail.
- Launch: an empty-store card for new sign-ups, plus a "we drafted your store" WhatsApp to creators who already stalled.

**7:15 – 7:45 · How I built it, and close**
"I used Claude as my coding agent. I made the product calls and reviewed its work, with a test for every edge case in the brief. With two more weeks: the official Instagram API, prices calibrated on SuperProfile's sales data, and helping creators actually make the product they just listed."
