# Case: tokenize

## What it shows

A trajectory read as the tokens its parts are worth. The counts are not taken here: they
were taken when the trajectory was produced, by the producer the tokenize extension builds,
and written among the parts they are about — so a reading gets them back without a tokenizer
in the run.

Two questions are asked of them. How the session grew as its parts accumulated: what each
part added, and what the session had been worth by it. And what the context of the last turn
was made of: how much of it is text, the reasoning a model was given back, the calls of tools
and their results, and a payload that is not text.

## When you need it

- Context windows: whether what fills one is the conversation, the tools, or the images in
  it — a share says what to cut without cutting anything first.
- Cost of a session over time: which turn or tool call made it grow, read off the growth of
  the total rather than summed part by part.
- Comparing a prompt change: the same context read before and after, kind by kind.
