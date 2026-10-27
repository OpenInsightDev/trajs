# Case: tokenize

The user asks where a timeout is read, and attaches a screenshot of the settings page. The model thinks, searches the repo, and answers.

You want to see the session grow, and you want to see what the last prompt was made of. The counts were saved when the trajectory was written, so this read does not tokenize anything again.

Growth is six parts. Each one adds some tokens, and the total is the sum so far.

The last prompt splits into the question text, the model's own reasoning played back into the prompt, the tool call, the tool result, and the screenshot. The screenshot is worth 255 tokens. Those five pieces add up to the whole prompt.

That is an estimate of the text. It is not the bill the provider sent.

```sh
vp test cases/tokenize
```
