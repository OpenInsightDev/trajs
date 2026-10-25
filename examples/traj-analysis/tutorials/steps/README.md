# Case: steps

Someone asks for the weather in Paris, then in Berlin. The model looks each city up and answers with one sentence.

You want a summary of that conversation: how many prompts, how much text came back, and which tools were used. The log is not stored in those units, though. One reply is several pieces in a row, and a summary that counts pieces will treat one reply as many.

Read as steps, the session is 2 prompts and 2 replies. Together they hold 6 messages, 26 characters of answer text ("It is sunny." and "It is raining."), and `get_weather` twice.

```sh
vp test tutorials/steps
```
