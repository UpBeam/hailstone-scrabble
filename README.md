# Hailstone Scrabble

**Scrabble fused with the Collatz Conjecture ($3n+1$)** — a push-your-luck word strategy game.

## Rules
* **Even Word ($n$):** Calm & surgical — immediately bank **$n / 2$** points.
* **Odd Word ($n$):** **Explosion ($3n + 1$)!** Bank 0 now and plant a live **Hailstone token** valued **$3n + 1$** on your anchor tile.
* **Hooking a Hailstone ($H$):**
  * Play an **even** word through it → **halve** $H \to \lfloor H/2 \rfloor$ and bank the drop + $n/2$.
  * Play an **odd** word through it → **spike** $H \to 3H + 1$!
  * **Crush to 1:** Halving a Hailstone to `1` shatters it for a **+15 Jackpot**.
* First to **100 points** (or highest score when the bag & rack empty) wins.

## Development
```bash
npm test
python3 -m http.server 4174
npm run pack:itch
```
