"use strict";

const STORAGE_KEY = "moodle-quiz-builder-v2";

const state = {
  project: {
    title: "Mein Quiz",
    defaultPoints: 1,
    questions: []
  },
  selectedId: null
};

const elements = {};
let saveTimer;
let toastTimer;

document.addEventListener("DOMContentLoaded", init);

function init() {
  document.querySelectorAll("[id]").forEach(element => {
    elements[element.id] = element;
  });

  bindEvents();
  loadLocalProject();

  if (!state.project.questions.length) {
    addQuestion();
  } else {
    state.selectedId = state.project.questions[0].id;
    render();
  }
}

function bindEvents() {
  elements.newProjectBtn.addEventListener("click", newProject);
  elements.projectImport.addEventListener("change", importProject);
  elements.saveProjectBtn.addEventListener("click", exportProjectJson);
  elements.previewBtn.addEventListener("click", showPreview);
  elements.validateBtn.addEventListener("click", runProjectValidation);
  elements.exportMoodleBtn.addEventListener("click", exportMoodleXml);
  elements.exportGiftBtn.addEventListener("click", exportGift);

  elements.projectTitle.addEventListener("input", () => {
    state.project.title = elements.projectTitle.value.trim() || "Mein Quiz";
    markChanged();
  });

  elements.addQuestionBtn.addEventListener("click", () => addQuestion());

  elements.openGeneratorBtn.addEventListener("click", () => {
    elements.generatorDialog.showModal();
  });

  elements.questionSearch.addEventListener("input", renderQuestionList);

  elements.questionForm.addEventListener("input", updateQuestionFromForm);
  elements.questionForm.addEventListener("change", updateQuestionFromForm);

  elements.addAnswerBtn.addEventListener("click", addAnswer);
  elements.previousQuestionBtn.addEventListener("click", () => navigateQuestion(-1));
  elements.nextQuestionBtn.addEventListener("click", () => navigateQuestion(1));
  elements.saveAndNextBtn.addEventListener("click", saveAndNext);
  elements.duplicateQuestionBtn.addEventListener("click", duplicateSelectedQuestion);
  elements.deleteQuestionBtn.addEventListener("click", deleteSelectedQuestion);

  [
    elements.questionType,
    elements.questionPoints,
    elements.shuffleAnswers,
    elements.allowNegative,
    elements.questionDifficulty,
    elements.questionTags
  ].forEach(control => {
    control.addEventListener("input", updateQuestionFromSettings);
    control.addEventListener("change", updateQuestionFromSettings);
  });

  elements.autoScoreBtn.addEventListener("click", autoDistributeScores);
  elements.validateQuestionBtn.addEventListener("click", validateSelectedQuestion);

  elements.singleGeneratorTab.addEventListener("click", () => {
    showGeneratorTab("single");
  });

  elements.bulkGeneratorTab.addEventListener("click", () => {
    showGeneratorTab("bulk");
  });

  elements.generateQuestionBtn.addEventListener("click", generateQuestion);
  elements.bulkGenerateBtn.addEventListener("click", bulkGenerate);

  elements.closePreviewBtn.addEventListener("click", () => {
    elements.previewDialog.close();
  });
}

function createId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createAnswer(text = "", correct = false, fraction = 0, feedback = "") {
  return {
    id: createId(),
    text,
    correct,
    fraction,
    feedback
  };
}

function createQuestion(overrides = {}) {
  return {
    id: createId(),
    type: "single",
    text: "Neue Frage",
    points: state.project.defaultPoints || 1,
    difficulty: "",
    tags: [],
    shuffle: true,
    allowNegative: false,
    feedback: "",
    answers: [
      createAnswer("Richtige Antwort", true, 100),
      createAnswer("Distraktor 1"),
      createAnswer("Distraktor 2")
    ],
    ...overrides
  };
}

function newProject() {
  if (!confirm("Das aktuelle Projekt verwerfen?")) return;

  state.project = {
    title: "Mein Quiz",
    defaultPoints: 1,
    questions: []
  };

  state.selectedId = null;
  localStorage.removeItem(STORAGE_KEY);
  addQuestion();
  showToast("Neues Projekt erstellt.");
}

function addQuestion(question = null) {
  const created = question || createQuestion();

  state.project.questions.push(created);
  state.selectedId = created.id;

  render();
  markChanged();

  requestAnimationFrame(() => elements.questionText.focus());
}

function getSelectedQuestion() {
  return state.project.questions.find(
    question => question.id === state.selectedId
  );
}

function getSelectedIndex() {
  return state.project.questions.findIndex(
    question => question.id === state.selectedId
  );
}

function selectQuestion(id) {
  state.selectedId = id;
  render();
}

function navigateQuestion(direction) {
  const target = state.project.questions[getSelectedIndex() + direction];

  if (target) {
    selectQuestion(target.id);
  }
}

function saveAndNext() {
  saveImmediately();

  const next = state.project.questions[getSelectedIndex() + 1];

  if (next) {
    selectQuestion(next.id);
  } else {
    addQuestion();
  }
}

function duplicateSelectedQuestion() {
  const question = getSelectedQuestion();

  if (question) {
    duplicateQuestionById(question.id);
  }
}

function duplicateQuestionById(id) {
  const original = state.project.questions.find(question => question.id === id);
  if (!original) return;

  const copy = structuredClone(original);
  copy.id = createId();
  copy.text = `${copy.text} – Kopie`;
  copy.answers = copy.answers.map(answer => ({
    ...answer,
    id: createId()
  }));

  const index = state.project.questions.findIndex(question => question.id === id);
  state.project.questions.splice(index + 1, 0, copy);
  state.selectedId = copy.id;

  render();
  markChanged();
  showToast("Frage dupliziert.");
}

function deleteSelectedQuestion() {
  const question = getSelectedQuestion();

  if (question) {
    deleteQuestionById(question.id);
  }
}

function deleteQuestionById(id) {
  const index = state.project.questions.findIndex(question => question.id === id);
  if (index < 0) return;

  if (!confirm("Diese Frage wirklich löschen?")) return;

  state.project.questions.splice(index, 1);

  const replacement =
    state.project.questions[index] ??
    state.project.questions[index - 1] ??
    null;

  state.selectedId = replacement?.id ?? null;

  render();
  markChanged();
  showToast("Frage gelöscht.");
}

function updateQuestionFromForm() {
  const question = getSelectedQuestion();
  if (!question) return;

  question.text = elements.questionText.value;
  question.feedback = elements.generalFeedback.value;

  renderQuestionList();
  markChanged();
}

function updateQuestionFromSettings(event) {
  const question = getSelectedQuestion();
  if (!question) return;

  const previousType = question.type;

  question.type = elements.questionType.value;
  question.points = Math.max(0.1, numberOr(elements.questionPoints.value, 1));
  question.shuffle = elements.shuffleAnswers.checked;
  question.allowNegative = elements.allowNegative.checked;
  question.difficulty = elements.questionDifficulty.value;
  question.tags = elements.questionTags.value
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean);

  if (question.type !== previousType) {
    normalizeCorrectAnswers(question);
    renderAnswers();
  }

  if (!question.allowNegative) {
    question.answers.forEach(answer => {
      if (answer.fraction < 0) {
        answer.fraction = 0;
      }
    });
    renderAnswers();
  }

  renderQuestionList();
  renderScoreSummary();
  markChanged();

  if (event?.type === "change") {
    validateSelectedQuestion();
  }
}

function normalizeCorrectAnswers(question) {
  if (question.type !== "single") return;

  const correctAnswers = question.answers.filter(answer => answer.correct);

  if (!correctAnswers.length && question.answers.length) {
    question.answers[0].correct = true;
    question.answers[0].fraction = 100;
  } else {
    correctAnswers.forEach((answer, index) => {
      answer.correct = index === 0;
      answer.fraction = index === 0 ? 100 : 0;
    });
  }
}

function addAnswer() {
  const question = getSelectedQuestion();
  if (!question) return;

  question.answers.push(
    createAnswer(`Antwort ${question.answers.length + 1}`)
  );

  renderAnswers();
  renderScoreSummary();
  markChanged();
}

function updateAnswer(answerId, field, value) {
  const question = getSelectedQuestion();
  const answer = question?.answers.find(item => item.id === answerId);

  if (!question || !answer) return;

  if (field === "correct") {
    if (question.type === "single" && value) {
      question.answers.forEach(item => {
        item.correct = item.id === answerId;
        item.fraction = item.id === answerId ? 100 : 0;
      });
    } else {
      answer.correct = value;

      if (!value && answer.fraction > 0) {
        answer.fraction = 0;
      }
    }

    renderAnswers();
  } else if (field === "fraction") {
    const minimum = question.allowNegative ? -100 : 0;
    answer.fraction = Math.min(100, Math.max(minimum, numberOr(value, 0)));
    answer.correct = answer.fraction > 0;

    if (question.type === "single" && answer.correct) {
      question.answers.forEach(item => {
        if (item.id !== answerId) {
          item.correct = false;
          item.fraction = 0;
        }
      });
    }

    renderAnswers();
  } else {
    answer[field] = value;
  }

  renderQuestionList();
  renderScoreSummary();
  markChanged();
}

function deleteAnswer(answerId) {
  const question = getSelectedQuestion();
  if (!question) return;

  if (question.answers.length <= 2) {
    showToast("Mindestens zwei Antworten sind erforderlich.");
    return;
  }

  question.answers = question.answers.filter(answer => answer.id !== answerId);
  normalizeCorrectAnswers(question);

  renderAnswers();
  renderScoreSummary();
  markChanged();
}

function moveAnswer(answerId, direction) {
  const question = getSelectedQuestion();
  if (!question) return;

  const index = question.answers.findIndex(answer => answer.id === answerId);
  const target = index + direction;

  if (index < 0 || target < 0 || target >= question.answers.length) return;

  [question.answers[index], question.answers[target]] =
    [question.answers[target], question.answers[index]];

  renderAnswers();
  markChanged();
}

function autoDistributeScores() {
  const question = getSelectedQuestion();
  if (!question) return;

  const correct = question.answers.filter(answer => answer.correct);
  const incorrect = question.answers.filter(answer => !answer.correct);

  if (!correct.length) {
    showToast("Markiere mindestens eine richtige Antwort.");
    return;
  }

  if (question.type === "single") {
    question.answers.forEach(answer => {
      answer.fraction = answer.correct ? 100 : 0;
    });
  } else {
    const positiveValue = round(100 / correct.length);

    correct.forEach(answer => {
      answer.fraction = positiveValue;
    });

    correct.at(-1).fraction = round(
      correct.at(-1).fraction +
      100 -
      sum(correct.map(answer => answer.fraction))
    );

    incorrect.forEach(answer => {
      answer.fraction = question.allowNegative
        ? round(-100 / Math.max(1, incorrect.length))
        : 0;
    });
  }

  renderAnswers();
  renderScoreSummary();
  markChanged();
  showToast("Gewichtungen verteilt.");
}

function render() {
  elements.projectTitle.value = state.project.title;
  elements.questionCount.textContent = state.project.questions.length;

  renderQuestionList();
  renderEditor();
  renderSettings();
  renderScoreSummary();
  updateNavigationButtons();
}

function renderQuestionList() {
  const search = elements.questionSearch.value
    .trim()
    .toLocaleLowerCase("de");

  elements.questionList.replaceChildren();
  elements.questionCount.textContent = state.project.questions.length;

  const filtered = state.project.questions.filter(question => {
    const searchable = `${question.text} ${question.tags.join(" ")}`
      .toLocaleLowerCase("de");

    return searchable.includes(search);
  });

  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Keine Fragen gefunden.";
    elements.questionList.append(empty);
    return;
  }

  filtered.forEach(question => {
    const actualIndex = state.project.questions.indexOf(question);
    const card = document.createElement("article");

    card.className =
      `question-card${question.id === state.selectedId ? " active" : ""}`;

    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "question-select";
    selectButton.title = "Frage bearbeiten";
    selectButton.addEventListener("click", () => selectQuestion(question.id));

    const name = document.createElement("span");
    name.className = "question-name";
    name.textContent =
      `${actualIndex + 1}. ${shorten(question.text || "Ohne Fragetext", 65)}`;

    const meta = document.createElement("span");
    meta.className = "question-meta";
    meta.textContent =
      `${question.type === "single" ? "Single Choice" : "Multiple Choice"}`
      + ` · ${formatNumber(question.points)} Punkt(e)`;

    selectButton.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "question-actions";

    actions.append(
      smallButton("Bearbeiten", () => selectQuestion(question.id)),
      smallButton("Duplizieren", () => duplicateQuestionById(question.id)),
      smallButton(
        "Löschen",
        () => deleteQuestionById(question.id),
        "danger"
      )
    );

    card.append(selectButton, actions);
    elements.questionList.append(card);
  });
}

function renderEditor() {
  const question = getSelectedQuestion();
  const exists = Boolean(question);

  elements.emptyState.hidden = exists;
  elements.questionForm.hidden = !exists;

  if (!question) return;

  elements.editorTitle.textContent =
    `Frage ${getSelectedIndex() + 1} bearbeiten`;

  elements.questionText.value = question.text;
  elements.generalFeedback.value = question.feedback;

  renderAnswers();
}

function renderSettings() {
  const question = getSelectedQuestion();
  const exists = Boolean(question);

  elements.settingsEmpty.hidden = exists;
  elements.settingsContent.hidden = !exists;

  if (!question) return;

  elements.questionType.value = question.type;
  elements.questionPoints.value = question.points;
  elements.shuffleAnswers.checked = question.shuffle;
  elements.allowNegative.checked = question.allowNegative;
  elements.questionDifficulty.value = question.difficulty;
  elements.questionTags.value = question.tags.join(", ");
}

function renderAnswers() {
  const question = getSelectedQuestion();
  elements.answerList.replaceChildren();

  if (!question) return;

  question.answers.forEach((answer, index) => {
    const card = document.createElement("div");
    card.className = `answer-card${answer.correct ? " correct" : ""}`;

    const marker = document.createElement("label");
    marker.className = "answer-marker";
    marker.title = "Als richtige Antwort markieren";

    const correctInput = document.createElement("input");
    correctInput.type = question.type === "single" ? "radio" : "checkbox";
    correctInput.name = "correct-answer";
    correctInput.checked = answer.correct;
    correctInput.addEventListener("change", event => {
      updateAnswer(answer.id, "correct", event.target.checked);
    });

    marker.append(correctInput);

    const textLabel = createLabel("Antworttext");
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.value = answer.text;
    textInput.placeholder = "Antwort oder Distraktor";
    textInput.addEventListener("input", event => {
      updateAnswer(answer.id, "text", event.target.value);
    });
    textLabel.append(textInput);

    const fractionLabel = createLabel("Gewichtung (%)");
    const fractionInput = document.createElement("input");
    fractionInput.type = "number";
    fractionInput.min = question.allowNegative ? "-100" : "0";
    fractionInput.max = "100";
    fractionInput.step = "0.01";
    fractionInput.value = answer.fraction;
    fractionInput.disabled = !question.allowNegative && !answer.correct;
    fractionInput.addEventListener("change", event => {
      updateAnswer(answer.id, "fraction", event.target.value);
    });
    fractionLabel.append(fractionInput);

    const controls = document.createElement("div");
    controls.className = "answer-controls";

    const up = iconButton("↑", "Nach oben", () => {
      moveAnswer(answer.id, -1);
    });

    const down = iconButton("↓", "Nach unten", () => {
      moveAnswer(answer.id, 1);
    });

    const remove = iconButton("×", "Antwort löschen", () => {
      deleteAnswer(answer.id);
    }, "danger");

    up.disabled = index === 0;
    down.disabled = index === question.answers.length - 1;

    controls.append(up, down, remove);

    const feedbackLabel = createLabel("Antwortfeedback");
    feedbackLabel.classList.add("answer-feedback");

    const feedbackInput = document.createElement("input");
    feedbackInput.type = "text";
    feedbackInput.value = answer.feedback;
    feedbackInput.placeholder = "Optional";
    feedbackInput.addEventListener("input", event => {
      updateAnswer(answer.id, "feedback", event.target.value);
    });

    feedbackLabel.append(feedbackInput);

    card.append(
      marker,
      textLabel,
      fractionLabel,
      controls,
      feedbackLabel
    );

    elements.answerList.append(card);
  });
}

function renderScoreSummary() {
  const question = getSelectedQuestion();
  elements.scoreSummary.replaceChildren();

  if (!question) return;

  const positive = sum(
    question.answers
      .filter(answer => answer.fraction > 0)
      .map(answer => answer.fraction)
  );

  const negative = sum(
    question.answers
      .filter(answer => answer.fraction < 0)
      .map(answer => answer.fraction)
  );

  [
    `Fragepunkte: ${formatNumber(question.points)}`,
    `Positive Gewichtung: ${formatNumber(positive)} %`,
    `Negative Gewichtung: ${formatNumber(negative)} %`,
    `Richtige Antworten: ${
      question.answers.filter(answer => answer.correct).length
    }`
  ].forEach(text => {
    const line = document.createElement("div");
    line.textContent = text;
    elements.scoreSummary.append(line);
  });
}

function updateNavigationButtons() {
  const index = getSelectedIndex();

  elements.previousQuestionBtn.disabled = index <= 0;
  elements.nextQuestionBtn.disabled =
    index < 0 || index >= state.project.questions.length - 1;
}

function createLabel(text) {
  const label = document.createElement("label");
  label.append(document.createTextNode(text));
  return label;
}

function smallButton(text, handler, className = "secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.className = className;
  button.addEventListener("click", event => {
    event.stopPropagation();
    handler();
  });
  return button;
}

function iconButton(text, title, handler, className = "secondary") {
  const button = smallButton(text, handler, className);
  button.title = title;
  return button;
}

function validateQuestion(question, index = null) {
  const issues = [];
  const prefix = index === null ? "" : `Frage ${index + 1}: `;
  const correct = question.answers.filter(answer => answer.correct);

  if (!question.text.trim()) {
    issues.push(`${prefix}Der Fragetext fehlt.`);
  }

  if (question.answers.length < 2) {
    issues.push(`${prefix}Mindestens zwei Antworten sind erforderlich.`);
  }

  if (question.answers.some(answer => !answer.text.trim())) {
    issues.push(`${prefix}Eine Antwort ist leer.`);
  }

  const normalizedTexts = question.answers
    .map(answer => answer.text.trim().toLocaleLowerCase("de"))
    .filter(Boolean);

  if (new Set(normalizedTexts).size !== normalizedTexts.length) {
    issues.push(`${prefix}Es gibt doppelte Antworten.`);
  }

  if (!correct.length) {
    issues.push(`${prefix}Es gibt keine richtige Antwort.`);
  }

  if (question.type === "single" && correct.length !== 1) {
    issues.push(
      `${prefix}Single Choice benötigt genau eine richtige Antwort.`
    );
  }

  const positive = sum(
    question.answers
      .filter(answer => answer.fraction > 0)
      .map(answer => answer.fraction)
  );

  if (Math.abs(positive - 100) > 0.02) {
    issues.push(
      `${prefix}Positive Gewichtungen ergeben `
      + `${formatNumber(positive)} % statt 100 %.`
    );
  }

  if (
    !question.allowNegative &&
    question.answers.some(answer => answer.fraction < 0)
  ) {
    issues.push(`${prefix}Es sind unerlaubte negative Gewichtungen vorhanden.`);
  }

  return issues;
}

function validateSelectedQuestion() {
  const question = getSelectedQuestion();
  if (!question) return [];

  const issues = validateQuestion(question);
  showValidation(issues);

  return issues;
}

function runProjectValidation() {
  const issues = state.project.questions.flatMap((question, index) => {
    return validateQuestion(question, index);
  });

  if (!state.project.questions.length) {
    issues.push("Das Projekt enthält keine Fragen.");
  }

  showValidation(issues);
  return issues;
}

function showValidation(issues) {
  elements.validationList.replaceChildren();

  if (!issues.length) {
    elements.validationSummary.textContent = "Keine Probleme gefunden.";
    elements.validationSummary.className = "validation-summary success";
    return;
  }

  elements.validationSummary.textContent =
    `${issues.length} Problem(e) gefunden.`;
  elements.validationSummary.className = "validation-summary warning";

  issues.forEach(issue => {
    const item = document.createElement("li");
    item.textContent = issue;
    elements.validationList.append(item);
  });
}

function showGeneratorTab(tab) {
  const single = tab === "single";

  elements.singleGeneratorPanel.hidden = !single;
  elements.bulkGeneratorPanel.hidden = single;
  elements.singleGeneratorTab.classList.toggle("active", single);
  elements.bulkGeneratorTab.classList.toggle("active", !single);
}

function generateQuestion() {
  const term = elements.generatorTerm.value.trim();
  const answer = elements.generatorAnswer.value.trim();
  const distractors = lines(elements.generatorDistractors.value);

  if (!term || !answer) {
    showToast("Bitte Thema und richtige Antwort eingeben.");
    return;
  }

  const answers = [
    createAnswer(answer, true, 100),
    ...distractors.map(text => createAnswer(text))
  ];

  while (answers.length < 3) {
    answers.push(createAnswer(`Distraktor ${answers.length}`));
  }

  addQuestion(createQuestion({
    text: `Welche Aussage zu „${term}“ ist richtig?`,
    answers
  }));

  elements.generatorTerm.value = "";
  elements.generatorAnswer.value = "";
  elements.generatorDistractors.value = "";
  elements.generatorDialog.close();

  showToast("Frage erstellt.");
}

function bulkGenerate() {
  const rows = lines(elements.bulkInput.value);
  let imported = 0;

  rows.forEach(row => {
    const columns = parseDelimitedRow(row)
      .map(value => value.trim());

    if (columns.length < 2 || !columns[0] || !columns[1]) return;

    const answers = [
      createAnswer(columns[1], true, 100),
      ...columns
        .slice(2)
        .filter(Boolean)
        .map(value => createAnswer(value))
    ];

    while (answers.length < 3) {
      answers.push(createAnswer(`Distraktor ${answers.length}`));
    }

    state.project.questions.push(createQuestion({
      text: columns[0],
      answers
    }));

    imported += 1;
  });

  if (!imported) {
    showToast("Keine gültigen Zeilen gefunden.");
    return;
  }

  state.selectedId = state.project.questions.at(-1).id;
  elements.bulkInput.value = "";
  elements.generatorDialog.close();

  render();
  markChanged();
  showToast(`${imported} Frage(n) importiert.`);
}

function parseDelimitedRow(row) {
  const delimiter = row.includes(";") ? ";" : "\t";
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];

    if (character === '"') {
      if (quoted && row[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  values.push(current);
  return values;
}

function showPreview() {
  elements.previewContent.replaceChildren();

  if (!state.project.questions.length) {
    elements.previewContent.textContent = "Das Projekt enthält keine Fragen.";
  }

  state.project.questions.forEach((question, index) => {
    const section = document.createElement("section");
    section.className = "preview-question";

    const heading = document.createElement("h3");
    heading.textContent =
      `${index + 1}. ${question.text} `
      + `(${formatNumber(question.points)} P.)`;

    section.append(heading);

    question.answers.forEach(answer => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      const text = document.createElement("span");

      input.type = question.type === "single" ? "radio" : "checkbox";
      input.name = `preview-${question.id}`;
      text.textContent = answer.text;

      label.append(input, text);
      section.append(label);
    });

    elements.previewContent.append(section);
  });

  elements.previewDialog.showModal();
}

function markChanged() {
  clearTimeout(saveTimer);

  if (elements.saveStatus) {
    elements.saveStatus.textContent = "Änderungen werden gespeichert …";
    elements.saveStatus.classList.add("saving");
  }

  saveTimer = setTimeout(saveImmediately, 350);
}

function saveImmediately() {
  clearTimeout(saveTimer);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project));

  if (elements.saveStatus) {
    elements.saveStatus.textContent = "Automatisch gespeichert";
    elements.saveStatus.classList.remove("saving");
  }
}

function loadLocalProject() {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (!stored) return;

  try {
    state.project = sanitizeProject(JSON.parse(stored));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function exportProjectJson() {
  saveImmediately();

  downloadFile(
    `${safeFilename(state.project.title)}.json`,
    JSON.stringify(state.project, null, 2),
    "application/json"
  );
}

async function importProject(event) {
  const file = event.target.files?.[0];
  event.target.value = "";

  if (!file) return;

  try {
    state.project = sanitizeProject(JSON.parse(await file.text()));
    state.selectedId = state.project.questions[0]?.id ?? null;

    render();
    saveImmediately();
    showToast("Projekt importiert.");
  } catch {
    showToast("Die Projektdatei ist ungültig.");
  }
}

function sanitizeProject(input) {
  if (
    !input ||
    typeof input !== "object" ||
    !Array.isArray(input.questions)
  ) {
    throw new Error("Ungültiges Projekt");
  }

  return {
    title: String(input.title || "Importiertes Quiz"),
    defaultPoints: Math.max(0.1, numberOr(input.defaultPoints, 1)),
    questions: input.questions.map(question => ({
      id: createId(),
      type: question.type === "multiple" ? "multiple" : "single",
      text: String(question.text || ""),
      points: Math.max(0.1, numberOr(question.points, 1)),
      difficulty: String(question.difficulty || ""),
      tags: Array.isArray(question.tags)
        ? question.tags.map(String)
        : [],
      shuffle: question.shuffle !== false,
      allowNegative: Boolean(question.allowNegative),
      feedback: String(question.feedback || ""),
      answers: Array.isArray(question.answers)
        ? question.answers.map(answer => ({
            id: createId(),
            text: String(answer.text || ""),
            correct: Boolean(answer.correct),
            fraction: numberOr(
              answer.fraction,
              answer.correct ? 100 : 0
            ),
            feedback: String(answer.feedback || "")
          }))
        : []
    }))
  };
}

function exportMoodleXml() {
  const issues = runProjectValidation();

  if (
    issues.length &&
    !confirm("Es gibt Prüfhinweise. Trotzdem exportieren?")
  ) {
    return;
  }

  const questionsXml = state.project.questions.map(question => {
    const tags = question.tags.length
      ? `<tags>${question.tags.map(tag =>
          `<tag><text>${xmlEscape(tag)}</text></tag>`
        ).join("")}</tags>`
      : "";

    const answers = question.answers.map(answer => `
      <answer fraction="${formatRaw(answer.fraction)}" format="html">
        <text>${cdata(answer.text)}</text>
        <feedback format="html">
          <text>${cdata(answer.feedback)}</text>
        </feedback>
      </answer>`).join("");

    return `
    <question type="multichoice">
      <name>
        <text>${xmlEscape(shorten(question.text || "Frage", 80))}</text>
      </name>
      <questiontext format="html">
        <text>${cdata(question.text)}</text>
      </questiontext>
      <generalfeedback format="html">
        <text>${cdata(question.feedback)}</text>
      </generalfeedback>
      <defaultgrade>${formatRaw(question.points)}</defaultgrade>
      <penalty>0.3333333</penalty>
      <hidden>0</hidden>
      <single>${question.type === "single" ? "true" : "false"}</single>
      <shuffleanswers>${question.shuffle ? "true" : "false"}</shuffleanswers>
      <answernumbering>abc</answernumbering>
      <showstandardinstruction>1</showstandardinstruction>
      <correctfeedback format="html"><text></text></correctfeedback>
      <partiallycorrectfeedback format="html"><text></text></partiallycorrectfeedback>
      <incorrectfeedback format="html"><text></text></incorrectfeedback>
      ${tags}
      ${answers}
    </question>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <question type="category">
    <category>
      <text>$course$/top/${xmlEscape(state.project.title)}</text>
    </category>
  </question>
  ${questionsXml}
</quiz>`;

  downloadFile(
    `${safeFilename(state.project.title)}-moodle.xml`,
    xml,
    "application/xml"
  );
}

function exportGift() {
  const issues = runProjectValidation();

  if (
    issues.length &&
    !confirm("Es gibt Prüfhinweise. Trotzdem exportieren?")
  ) {
    return;
  }

  const gift = state.project.questions.map((question, index) => {
    const title = giftEscape(
      shorten(question.text || `Frage ${index + 1}`, 60),
      false
    );

    const answers = question.answers.map(answer => {
      const prefix = answer.fraction === 100
        ? "="
        : `~%${formatRaw(answer.fraction)}%`;

      const feedback = answer.feedback
        ? `#${giftEscape(answer.feedback)}`
        : "";

      return `${prefix}${giftEscape(answer.text)}${feedback}`;
    }).join("\n");

    return `::${title}::${giftEscape(question.text, false)} {\n`
      + `${answers}\n}`;
  }).join("\n\n");

  downloadFile(
    `${safeFilename(state.project.title)}.gift.txt`,
    gift,
    "text/plain"
  );
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob(
    [content],
    { type: `${mimeType};charset=utf-8` }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showToast(message) {
  clearTimeout(toastTimer);

  elements.toast.textContent = message;
  elements.toast.classList.add("visible");

  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2600);
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cdata(value) {
  return `<![CDATA[${
    String(value).replaceAll("]]>", "]]]]><![CDATA[>")
  }]]>`;
}

function giftEscape(value, escapeColon = true) {
  let result = String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("~", "\\~")
    .replaceAll("=", "\\=")
    .replaceAll("#", "\\#")
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}");

  if (escapeColon) {
    result = result.replaceAll(":", "\\:");
  }

  return result;
}

function safeFilename(value) {
  return String(value)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-") || "quiz";
}

function lines(value) {
  return String(value)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function shorten(value, maximum) {
  const text = String(value).trim();

  return text.length > maximum
    ? `${text.slice(0, maximum - 1)}…`
    : text;
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sum(values) {
  return values.reduce(
    (total, value) => total + Number(value || 0),
    0
  );
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function formatNumber(value) {
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 2
  }).format(value);
}

function formatRaw(value) {
  return String(round(numberOr(value, 0)));
}
