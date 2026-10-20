"use client";

import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@trajs/ui-shadcn/questionnaire";

/**
 * The root owns the flow, so the items are declared once in `items` — what the
 * shortcuts and the progress are read from — and each is written out again as
 * the content it is shown as.
 */
const items = [
  {
    name: "layout",
    required: true,
    choices: [{ value: "grid" }, { value: "list" }, { value: "timeline" }],
  },
  { name: "note" },
];

export function QuestionnaireDemo() {
  return (
    <Questionnaire
      className="w-full max-w-md"
      items={items}
      onSubmit={(event) => event.preventDefault()}
    >
      <QuestionnaireProgress />
      <QuestionnaireItem name="layout" required>
        <QuestionnaireTitle>How should the trajectory be read?</QuestionnaireTitle>
        <QuestionnaireDescription>
          This sets the layout a session is opened in.
        </QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="grid">
            Grid
            <QuestionnaireChoiceDescription>
              Turns beside each other, one card each
            </QuestionnaireChoiceDescription>
          </QuestionnaireChoice>
          <QuestionnaireChoice value="list">
            List
            <QuestionnaireChoiceDescription>
              Turns in order, one under another
            </QuestionnaireChoiceDescription>
          </QuestionnaireChoice>
          <QuestionnaireChoice value="timeline">
            Timeline
            <QuestionnaireChoiceDescription>
              Turns against the time they took
            </QuestionnaireChoiceDescription>
          </QuestionnaireChoice>
        </QuestionnaireChoices>
      </QuestionnaireItem>
      <QuestionnaireItem name="note">
        <QuestionnaireTitle>Anything to note first?</QuestionnaireTitle>
        <QuestionnaireInput placeholder="Optional" />
      </QuestionnaireItem>
      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireSkip />
        <QuestionnaireNext />
        <QuestionnaireSubmit>Finish</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  );
}
