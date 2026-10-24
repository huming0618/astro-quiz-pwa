
(() => {
  const $ = (id) => document.getElementById(id);
  const views = {
    home: $("view-home"),
    quiz: $("view-quiz"),
    result: $("view-result"),
  };

  let bank = null;
  let session = null;
  let deferredPrompt = null;
  const WRONG_KEY = "astro-quiz-wrong-ids";

  function show(view) {
    Object.values(views).forEach((v) => v.classList.add("hidden"));
    views[view].classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function loadWrongIds() {
    try {
      return new Set(JSON.parse(localStorage.getItem(WRONG_KEY) || "[]"));
    } catch {
      return new Set();
    }
  }
  function saveWrongIds(set) {
    localStorage.setItem(WRONG_KEY, JSON.stringify([...set]));
  }
  function addWrong(id) {
    const s = loadWrongIds();
    s.add(id);
    saveWrongIds(s);
  }
  function removeWrong(id) {
    const s = loadWrongIds();
    s.delete(id);
    saveWrongIds(s);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function sectionKey(q) {
    return `${q.sourceLabel || q.source} · ${q.section || "未分类"}`;
  }

  function populateHome() {
    const stats = bank.stats || {};
    const total = stats.total || bank.questions.length;
    const withAns = stats.withAnswer || bank.questions.filter((q) => q.answer).length;
    $("homeStats").textContent = `题库共 ${total} 题，其中 ${withAns} 题含标准答案，可自动判分。`;

    const chips = $("homeChips");
    chips.innerHTML = "";
    const byType = stats.byType || {};
    Object.entries(byType).forEach(([k, v]) => {
      const c = document.createElement("span");
      c.className = "chip";
      c.textContent = `${k} ${v}`;
      chips.appendChild(c);
    });
    const w = loadWrongIds().size;
    const cw = document.createElement("span");
    cw.className = "chip gold";
    cw.textContent = `本地错题 ${w}`;
    chips.appendChild(cw);

    const sections = new Map();
    bank.questions.forEach((q) => {
      const k = sectionKey(q);
      sections.set(k, (sections.get(k) || 0) + 1);
    });
    const sel = $("sectionSelect");
    sel.innerHTML = "";
    [...sections.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "zh"))
      .forEach(([k, n]) => {
        const opt = document.createElement("option");
        opt.value = k;
        opt.textContent = `${k}（${n}）`;
        sel.appendChild(opt);
      });

    const ul = $("sourceList");
    ul.innerHTML = "";
    (bank.sources || []).forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s.short || s.title || s.file;
      ul.appendChild(li);
    });
  }

  function filterQuestions() {
    const mode = $("modeSelect").value;
    const diff = $("diffSelect").value;
    const onlyAns = $("onlyAnswered").checked;
    const section = $("sectionSelect").value;
    let list = bank.questions.slice();

    if (onlyAns) list = list.filter((q) => q.answer);
    if (diff !== "all") list = list.filter((q) => q.difficulty === diff);

    if (mode === "section") {
      list = list.filter((q) => sectionKey(q) === section);
    } else if (mode === "wrong") {
      const wrong = loadWrongIds();
      list = list.filter((q) => wrong.has(q.id));
    }

    list = shuffle(list);
    let n = parseInt($("countSelect").value, 10);
    if (!n) n = Math.min(200, list.length);
    return list.slice(0, n);
  }

  function startQuiz(list, meta) {
    if (!list.length) {
      alert("当前筛选条件下没有题目，请调整模式/难度，或先积累错题。");
      return;
    }
    session = {
      list,
      index: 0,
      correct: 0,
      answered: 0,
      wrongThisRound: [],
      selected: new Set(),
      submitted: false,
      meta: meta || {},
    };
    show("quiz");
    renderQuestion();
  }

  function currentQ() {
    return session.list[session.index];
  }

  function renderQuestion() {
    const q = currentQ();
    session.selected = new Set();
    session.submitted = false;

    const total = session.list.length;
    const i = session.index + 1;
    $("progressText").textContent = `第 ${i} / ${total} 题`;
    $("scoreLive").textContent = `得分 ${session.correct}`;
    $("progressBar").style.width = `${((i - 1) / total) * 100}%`;

    const meta = $("qMeta");
    meta.innerHTML = "";
    [
      q.type || "单选",
      q.difficulty || "",
      q.sourceLabel || "",
      q.section || "",
    ]
      .filter(Boolean)
      .forEach((t) => {
        const c = document.createElement("span");
        c.className = "chip";
        c.textContent = t;
        meta.appendChild(c);
      });

    $("qStem").textContent = q.stem;
    $("qFeedback").className = "feedback hidden";
    $("qFeedback").innerHTML = "";
    const kn = $("qKnowledge");
    if (kn) {
      kn.classList.add("hidden");
      kn.innerHTML = "";
    }
    $("nextRow").classList.add("hidden");
    $("btnSubmit").disabled = false;
    $("btnSubmit").textContent = "提交答案";

    const optsEl = $("qOptions");
    optsEl.innerHTML = "";
    const fillWrap = $("qFillWrap");
    const isFill = q.type === "填空" || !q.options || Object.keys(q.options).length < 2;
    const isMulti = q.type === "多选";

    if (isFill) {
      fillWrap.classList.remove("hidden");
      $("qFill").value = "";
      $("qFill").disabled = false;
    } else {
      fillWrap.classList.add("hidden");
      Object.keys(q.options)
        .sort()
        .forEach((letter) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "opt";
          btn.dataset.letter = letter;
          btn.innerHTML = `<span class="key">${letter}</span><span class="val"></span>`;
          btn.querySelector(".val").textContent = q.options[letter];
          btn.addEventListener("click", () => {
            if (session.submitted) return;
            if (isMulti) {
              if (session.selected.has(letter)) {
                session.selected.delete(letter);
                btn.classList.remove("selected");
              } else {
                session.selected.add(letter);
                btn.classList.add("selected");
              }
            } else {
              session.selected = new Set([letter]);
              [...optsEl.children].forEach((el) => el.classList.remove("selected"));
              btn.classList.add("selected");
            }
          });
          optsEl.appendChild(btn);
        });
    }
  }

  function normalizeUserAnswer(q) {
    const isFill = q.type === "填空" || !q.options || Object.keys(q.options).length < 2;
    if (isFill) {
      return ($("qFill").value || "")
        .toUpperCase()
        .replace(/[^A-D]/g, "")
        .split("")
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort()
        .join("");
    }
    return [...session.selected].sort().join("");
  }

  function submitAnswer() {
    if (!session || session.submitted) return;
    const q = currentQ();
    const user = normalizeUserAnswer(q);
    if (!user) {
      alert(q.type === "多选" ? "请至少选择一个选项" : "请先选择或输入答案");
      return;
    }
    session.submitted = true;
    session.answered += 1;

    const ans = (q.answer || "").toUpperCase();
    const ok = ans && user === ans;
    if (ok) {
      session.correct += 1;
      removeWrong(q.id);
    } else {
      addWrong(q.id);
      session.wrongThisRound.push(q.id);
    }

    // paint options
    const optsEl = $("qOptions");
    [...optsEl.children].forEach((el) => {
      const letter = el.dataset.letter;
      el.disabled = true;
      if (ans.includes(letter)) el.classList.add("correct");
      if (user.includes(letter) && !ans.includes(letter)) el.classList.add("wrong");
    });
    if (q.type === "填空" || !q.options || Object.keys(q.options).length < 2) {
      $("qFill").disabled = true;
    }

    const fb = $("qFeedback");
    fb.classList.remove("hidden");
    fb.className = "feedback " + (ok ? "ok" : "bad");
    let html = ok
      ? `<strong>回答正确</strong>`
      : `<strong>回答错误</strong> · 你的答案：${user || "（空）"}；正确答案：${ans || "（题库暂无）"}`;
    html += `<div class="explain">来源：${escapeHtml(q.sourceLabel || "")} · ${escapeHtml(q.section || "")} · 题号 ${escapeHtml(String(q.number || ""))}</div>`;
    fb.innerHTML = html;

    const knowledgeText = String(q.explanation || q.knowledge || "").trim();
    const kn = $("qKnowledge");
    if (kn) {
      if (knowledgeText) {
        kn.classList.remove("hidden");
        kn.innerHTML =
          `<div class="knowledge-title">相关知识</div>` +
          `<div class="knowledge-body">${escapeHtml(knowledgeText)}</div>`;
      } else {
        kn.classList.add("hidden");
        kn.innerHTML = "";
      }
    }

    $("btnSubmit").disabled = true;
    $("nextRow").classList.remove("hidden");
    $("scoreLive").textContent = `得分 ${session.correct}`;
    const total = session.list.length;
    $("progressBar").style.width = `${(session.index + 1) / total * 100}%`;

    if (session.index >= session.list.length - 1) {
      $("btnNext").textContent = "查看成绩";
    } else {
      $("btnNext").textContent = "下一题";
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function nextOrFinish() {
    if (!session) return;
    if (session.index >= session.list.length - 1) {
      finishQuiz();
      return;
    }
    session.index += 1;
    renderQuestion();
  }

  function finishQuiz() {
    const total = session.list.length;
    const correct = session.correct;
    const wrong = total - correct;
    const pct = total ? Math.round((correct / total) * 100) : 0;
    $("resultScore").textContent = pct + "%";
    $("statTotal").textContent = String(total);
    $("statCorrect").textContent = String(correct);
    $("statWrong").textContent = String(wrong);
    $("resultHint").textContent =
      pct >= 90
        ? "非常出色！可以挑战更高难度或附加题。"
        : pct >= 70
        ? "不错的成绩，错题已记入本地，可专门复习。"
        : "继续加油！建议用「只练错题」巩固薄弱点。";
    show("result");
  }

  // events
  $("modeSelect").addEventListener("change", () => {
    const m = $("modeSelect").value;
    $("sectionField").classList.toggle("hidden", m !== "section");
  });

  $("btnStart").addEventListener("click", () => {
    const list = filterQuestions();
    startQuiz(list);
  });
  $("btnSubmit").addEventListener("click", submitAnswer);
  $("btnNext").addEventListener("click", nextOrFinish);
  $("btnQuit").addEventListener("click", () => {
    if (confirm("确定结束本轮练习并查看成绩？")) finishQuiz();
  });
  $("btnHome").addEventListener("click", () => {
    populateHome();
    show("home");
  });
  $("btnRetry").addEventListener("click", () => {
    const list = filterQuestions();
    startQuiz(list);
  });
  $("btnReviewWrong").addEventListener("click", () => {
    if (!session || !session.wrongThisRound.length) {
      alert("本轮没有错题可复习。");
      return;
    }
    const map = new Map(bank.questions.map((q) => [q.id, q]));
    const list = session.wrongThisRound.map((id) => map.get(id)).filter(Boolean);
    startQuiz(shuffle(list));
  });
  $("btnSkipExplain").addEventListener("click", () => {
    const q = currentQ();
    alert(
      `来源文件：${q.sourceLabel || q.source}\n章节：${q.section || "-"}\n题号：${q.number || "-"}\n难度：${q.difficulty || "-"}\n类型：${q.type || "-"}`
    );
  });

  // PWA install
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("installBanner").classList.add("show");
  });
  $("btnInstall").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("installBanner").classList.remove("show");
  });

  async function init() {
    try {
      const res = await fetch("data/questions.json");
      bank = await res.json();
      populateHome();
    } catch (err) {
      $("homeStats").textContent = "题库加载失败。请通过本地 HTTP 服务打开（见 README）。";
      console.error(err);
    }
    if ("serviceWorker" in navigator) {
      try {
        await navigator.serviceWorker.register("./sw.js");
      } catch (e) {
        console.warn("SW register failed", e);
      }
    }
  }

  init();
})();
