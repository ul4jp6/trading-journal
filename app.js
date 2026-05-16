const API_URL = "https://script.google.com/macros/s/AKfycbyduL3GWfOqoLLb685E2aHRyw5BzPd-ScOdh9ERYL6GGHqJlB-Lmyi8Awpjg8mjd_p9/exec";

async function gsGet(key) {
  try {
    const r = await fetch(`${API_URL}?action=get&key=${encodeURIComponent(key)}`);
    const j = await r.json();
    return j.ok && j.data ? JSON.parse(j.data) : null;
  } catch { return null; }
}

async function gsSet(key, value) {
  try {
    await fetch(`${API_URL}?action=set&key=${encodeURIComponent(key)}&value=${encodeURIComponent(JSON.stringify(value))}`);
  } catch {}
}

const POINT_VALUE = { "微台": 10, "選擇權": 50 };

function generateExpiryOptions() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const options = [];

  // 只產生當月和下個月
  for (let offset = 0; offset <= 1; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const mm = String(month + 1).padStart(2, "0");
    const days = new Date(year, month + 1, 0).getDate();

    const wednesdays = [], fridays = [];
    for (let day = 1; day <= days; day++) {
      const date = new Date(year, month, day);
      const dow = date.getDay();
      if (dow === 3) wednesdays.push({ date, day });
      if (dow === 5) fridays.push({ date, day });
    }

    // 月選（最後一個週三）
    const monthExpiry = wednesdays.length > 0 ? wednesdays[wednesdays.length - 1].date : null;

    wednesdays.forEach(({ date }, i) => {
      if (date >= today) options.push(`${mm}w${i + 1}`);
    });


    fridays.forEach(({ date }, i) => {
      if (date >= today) options.push(`${mm}F${i + 1}`);
    });
  }

  return [...new Set(options)];
}

const EXPIRY_OPTIONS = generateExpiryOptions();
const { useState, useEffect } = React;

function nowStr() { return new Date().toISOString().slice(0, 16); }
function fmtDate(iso) { return iso ? iso.replace("T", " ").slice(0, 16) : ""; }
function fmtMoney(n) {
  if (n == null) return "";
  return (n >= 0 ? "+" : "-") + Math.abs(n).toLocaleString();
}

function computePnl(trades) {
  const groups = {};
  trades.forEach((t, idx) => {
    const key = t.product === "微台" ? "微台" : `${t.expiry}-${t.strike}-${t.cp}-${t.side}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ ...t, _idx: idx });
  });
  const pnlMap = {};
  trades.forEach((_, i) => (pnlMap[i] = null));
  Object.values(groups).forEach(group => {
    const sorted = [...group].sort((a, b) => new Date(a.time) - new Date(b.time));
    const queue = [];
    let currentDir = null;
    sorted.forEach(t => {
      const qty = Number(t.qty);
      const price = Number(t.price);
      const dir = t.direction === "買進" ? 1 : -1;
      const pv = POINT_VALUE[t.product] || 50;
      if (queue.length === 0) {
        currentDir = dir;
        queue.push({ price, qty });
      } else if (dir === currentDir) {
        queue.push({ price, qty });
      } else {
        let remaining = qty, totalPnl = 0;
        while (remaining > 0 && queue.length > 0) {
          const head = queue[0];
          const matched = Math.min(remaining, head.qty);
          totalPnl += currentDir === 1 ? (price - head.price) * matched * pv : (head.price - price) * matched * pv;
          head.qty -= matched;
          remaining -= matched;
          if (head.qty === 0) queue.shift();
        }
        pnlMap[t._idx] = totalPnl;
        if (remaining > 0) {
          currentDir = dir;
          queue.length = 0;
          queue.push({ price, qty: remaining });
        }
      }
    });
  });
  return pnlMap;
}

const TABS = ["交易紀錄", "資金", "損益總覽", "輸出"];

function App() {
  const [tab, setTab] = useState(0);
  const [trades, setTrades] = useState([]);
  const [funds, setFunds] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    (async () => {
      setSyncMsg("連接中…");
      const [t, f, b] = await Promise.all([gsGet("tj:trades"), gsGet("tj:funds"), gsGet("tj:balances")]);
      if (t) setTrades(t);
      if (f) setFunds(f);
      if (b) setBalances(b);
      setLoaded(true);
      setSyncMsg("已同步 ✓");
      setTimeout(() => setSyncMsg(""), 2000);
    })();
  }, []);

  async function sync(key, val, setter) {
    setter(val);
    setSyncing(true); setSyncMsg("儲存中…");
    await gsSet(key, val);
    setSyncing(false); setSyncMsg("已同步 ✓");
    setTimeout(() => setSyncMsg(""), 1500);
  }

  const saveTrades = v => sync("tj:trades", v, setTrades);
  const saveFunds = v => sync("tj:funds", v, setFunds);
  const saveBalances = v => sync("tj:balances", v, setBalances);
  const pnlMap = computePnl(trades);

  if (!loaded) return (
    React.createElement("div", { style: { ...s.app, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, minHeight: "100vh" } },
      React.createElement("div", { style: s.spinner }),
      React.createElement("div", { style: { color: "#64748b", fontSize: 13 } }, "連接 Google Sheets…")
    )
  );

  return (
    React.createElement("div", { style: s.app },
      React.createElement("header", { style: s.header },
        React.createElement("span", { style: s.logo }, "📊 交易日誌"),
        React.createElement("span", { style: { fontSize: 11, marginLeft: "auto", color: syncing ? "#f59e0b" : syncMsg ? "#22c55e" : "#475569" } }, syncMsg || "● Google Sheets")
      ),
      React.createElement("nav", { style: s.nav },
        TABS.map((t, i) => React.createElement("button", { key: i, style: { ...s.navBtn, ...(tab === i ? s.navActive : {}) }, onClick: () => setTab(i) }, t))
      ),
      React.createElement("main", { style: s.main },
        tab === 0 && React.createElement(TradesTab, { trades, saveTrades, pnlMap }),
        tab === 1 && React.createElement(FundsTab, { funds, saveFunds, balances, saveBalances }),
        tab === 2 && React.createElement(SummaryTab, { trades, pnlMap, balances }),
        tab === 3 && React.createElement(ExportTab, { trades, pnlMap, funds, balances })
      )
    )
  );
}

function defaultTradeForm() {
  return { time: nowStr(), product: "微台", direction: "買進", qty: "", price: "", expiry: EXPIRY_OPTIONS[0] || "", strike: "", cp: "Call", side: "買方" };
}

function TradesTab({ trades, saveTrades, pnlMap }) {
  const [form, setForm] = useState(defaultTradeForm());
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState(false);

  async function addTrade() {
    if (!form.qty || !form.price) return;
    setSaving(true);
    await saveTrades([...trades, { ...form, id: Date.now() }]);
    setForm(defaultTradeForm());
    setShowForm(false);
    setSaving(false);
  }

  async function deleteTrade(id) {
    if (!window.confirm("確定刪除？")) return;
    await saveTrades(trades.filter(t => t.id !== id));
  }

  const filtered = filter === "all" ? trades : trades.filter(t => t.product === filter);
  const sorted = [...filtered].sort((a, b) => new Date(b.time) - new Date(a.time));

  return React.createElement("div", null,
    React.createElement("div", { style: s.row },
      React.createElement("div", { style: s.filterRow },
        ["all", "微台", "選擇權"].map(f =>
          React.createElement("button", { key: f, style: { ...s.chip, ...(filter === f ? s.chipActive : {}) }, onClick: () => setFilter(f) }, f === "all" ? "全部" : f)
        )
      ),
      React.createElement("button", { style: s.addBtn, onClick: () => setShowForm(v => !v) }, "＋ 新增")
    ),
    showForm && React.createElement("div", { style: s.formCard },
      React.createElement("div", { style: s.formGrid },
        React.createElement("label", { style: s.label }, "時間"),
        React.createElement("input", { style: s.input, type: "datetime-local", value: form.time, onChange: e => setForm(f => ({ ...f, time: e.target.value })) }),
        React.createElement("label", { style: s.label }, "商品"),
        React.createElement("select", { style: s.input, value: form.product, onChange: e => setForm(f => ({ ...f, product: e.target.value })) },
          React.createElement("option", null, "微台"),
          React.createElement("option", null, "選擇權")
        ),
        React.createElement("label", { style: s.label }, "方向"),
        React.createElement("div", { style: { display: "flex", gap: 8 } },
          ["買進", "賣出"].map(d => React.createElement("button", { key: d, onClick: () => setForm(f => ({ ...f, direction: d })), style: { ...s.dirBtn, ...(form.direction === d ? (d === "買進" ? s.dirBuy : s.dirSell) : {}) } }, d))
        ),
        React.createElement("label", { style: s.label }, "口數"),
        React.createElement("input", { style: s.input, type: "number", min: "1", placeholder: "口數", value: form.qty, onChange: e => setForm(f => ({ ...f, qty: e.target.value })) }),
        React.createElement("label", { style: s.label }, "成交價"),
        React.createElement("input", { style: s.input, type: "number", placeholder: "成交價", value: form.price, onChange: e => setForm(f => ({ ...f, price: e.target.value })) }),
        form.product === "選擇權" && React.createElement(React.Fragment, null,
          React.createElement("label", { style: s.label }, "到期月"),
          React.createElement("select", { style: s.input, value: form.expiry, onChange: e => setForm(f => ({ ...f, expiry: e.target.value })) },
            EXPIRY_OPTIONS.map(o => React.createElement("option", { key: o }, o))
          ),
          React.createElement("label", { style: s.label }, "履約價"),
          React.createElement("input", { style: s.input, type: "number", placeholder: "履約價", value: form.strike, onChange: e => setForm(f => ({ ...f, strike: e.target.value })) }),
          React.createElement("label", { style: s.label }, "C / P"),
          React.createElement("div", { style: { display: "flex", gap: 8 } },
            ["Call", "Put"].map(d => React.createElement("button", { key: d, onClick: () => setForm(f => ({ ...f, cp: d })), style: { ...s.dirBtn, ...(form.cp === d ? s.dirBuy : {}) } }, d))
          ),
          React.createElement("label", { style: s.label }, "買賣方"),
          React.createElement("div", { style: { display: "flex", gap: 8 } },
            ["買方", "賣方"].map(d => React.createElement("button", { key: d, onClick: () => setForm(f => ({ ...f, side: d })), style: { ...s.dirBtn, ...(form.side === d ? s.dirBuy : {}) } }, d))
          )
        )
      ),
      React.createElement("div", { style: s.formActions },
        React.createElement("button", { style: s.cancelBtn, onClick: () => setShowForm(false) }, "取消"),
        React.createElement("button", { style: { ...s.saveBtn, opacity: saving ? 0.6 : 1 }, onClick: addTrade, disabled: saving }, saving ? "儲存中…" : "確認新增")
      )
    ),
    React.createElement("div", { style: s.tradeList },
      sorted.length === 0 && React.createElement("div", { style: s.empty }, "尚無交易紀錄"),
      sorted.map(t => {
        const pnl = pnlMap[trades.indexOf(t)];
        return React.createElement("div", { key: t.id, style: s.tradeCard },
          React.createElement("div", { style: s.tradeTop },
            React.createElement("span", { style: { ...s.badge, background: t.direction === "買進" ? "#22c55e22" : "#ef444422", color: t.direction === "買進" ? "#16a34a" : "#dc2626" } }, t.direction),
            React.createElement("span", { style: s.tradeProduct }, t.product),
            t.product === "選擇權" && React.createElement("span", { style: s.tradeDetail }, `${t.expiry} ${t.strike}${t.cp} ${t.side}`),
            React.createElement("span", { style: s.tradeTime }, fmtDate(t.time)),
            React.createElement("button", { style: s.delBtn, onClick: () => deleteTrade(t.id) }, "✕")
          ),
          React.createElement("div", { style: s.tradeBottom },
            React.createElement("span", { style: s.tradePrice }, "成交價 ", React.createElement("b", null, Number(t.price).toLocaleString())),
            React.createElement("span", { style: s.tradeQty }, `${t.qty} 口`),
            React.createElement("span", { style: { ...s.pnlBadge, color: pnl !== null ? (pnl >= 0 ? "#16a34a" : "#dc2626") : "#475569" } }, pnl !== null ? fmtMoney(pnl) + " 元" : "未平倉")
          )
        );
      })
    )
  );
}

function FundsTab({ funds, saveFunds, balances, saveBalances }) {
  const [fundForm, setFundForm] = useState({ time: nowStr(), type: "入金", amount: "" });
  const [balForm, setBalForm] = useState({ time: nowStr(), amount: "" });
  const [showFF, setShowFF] = useState(false);
  const [showBF, setShowBF] = useState(false);
  const [saving, setSaving] = useState(false);

  async function addFund() {
    if (!fundForm.amount) return;
    setSaving(true);
    await saveFunds([...funds, { ...fundForm, id: Date.now() }]);
    setFundForm({ time: nowStr(), type: "入金", amount: "" });
    setShowFF(false); setSaving(false);
  }

  async function addBalance() {
    if (!balForm.amount) return;
    setSaving(true);
    await saveBalances([...balances, { ...balForm, id: Date.now() }]);
    setBalForm({ time: nowStr(), amount: "" });
    setShowBF(false); setSaving(false);
  }

  const sortedBal = [...balances].sort((a, b) => new Date(b.time) - new Date(a.time));
  const sortedFunds = [...funds].sort((a, b) => new Date(b.time) - new Date(a.time));
  const latestBal = sortedBal[0];
  const totalIn = funds.filter(f => f.type === "入金").reduce((s, f) => s + Number(f.amount), 0);
  const totalOut = funds.filter(f => f.type === "出金").reduce((s, f) => s + Number(f.amount), 0);

  return React.createElement("div", null,
    React.createElement("div", { style: s.section },
      React.createElement("div", { style: s.sectionHeader },
        React.createElement("span", { style: s.sectionTitle }, "帳戶餘額"),
        React.createElement("button", { style: s.addBtn, onClick: () => setShowBF(v => !v) }, "＋ 更新")
      ),
      latestBal && React.createElement("div", { style: s.balCard },
        React.createElement("span", { style: s.balAmount }, `$ ${Number(latestBal.amount).toLocaleString()}`),
        React.createElement("span", { style: s.balTime }, fmtDate(latestBal.time))
      ),
      showBF && React.createElement("div", { style: s.formCard },
        React.createElement("div", { style: s.formGrid },
          React.createElement("label", { style: s.label }, "時間"),
          React.createElement("input", { style: s.input, type: "datetime-local", value: balForm.time, onChange: e => setBalForm(f => ({ ...f, time: e.target.value })) }),
          React.createElement("label", { style: s.label }, "帳戶金額"),
          React.createElement("input", { style: s.input, type: "number", placeholder: "目前帳戶金額", value: balForm.amount, onChange: e => setBalForm(f => ({ ...f, amount: e.target.value })) })
        ),
        React.createElement("div", { style: s.formActions },
          React.createElement("button", { style: s.cancelBtn, onClick: () => setShowBF(false) }, "取消"),
          React.createElement("button", { style: { ...s.saveBtn, opacity: saving ? 0.6 : 1 }, onClick: addBalance, disabled: saving }, saving ? "儲存中…" : "確認")
        )
      ),
      React.createElement("div", { style: s.tradeList },
        sortedBal.map(b => React.createElement("div", { key: b.id, style: { ...s.tradeCard, padding: "10px 14px", display: "flex", alignItems: "center" } },
          React.createElement("span", { style: s.tradeTime }, fmtDate(b.time)),
          React.createElement("span", { style: { marginLeft: "auto", fontWeight: 700, color: "#38bdf8" } }, `$ ${Number(b.amount).toLocaleString()}`),
          React.createElement("button", { style: s.delBtn, onClick: () => saveBalances(balances.filter(x => x.id !== b.id)) }, "✕")
        ))
      )
    ),
    React.createElement("div", { style: s.section },
      React.createElement("div", { style: s.sectionHeader },
        React.createElement("span", { style: s.sectionTitle }, "出入金"),
        React.createElement("button", { style: s.addBtn, onClick: () => setShowFF(v => !v) }, "＋ 新增")
      ),
      React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12 } },
        [["累計入金", `+${totalIn.toLocaleString()}`, "#22c55e"], ["累計出金", `-${totalOut.toLocaleString()}`, "#ef4444"], ["淨入金", (totalIn - totalOut).toLocaleString(), "#94a3b8"]].map(([label, val, color]) =>
          React.createElement("div", { key: label, style: s.miniCard },
            React.createElement("span", { style: s.miniLabel }, label),
            React.createElement("span", { style: { color, fontWeight: 700, fontSize: 12 } }, val)
          )
        )
      ),
      showFF && React.createElement("div", { style: s.formCard },
        React.createElement("div", { style: s.formGrid },
          React.createElement("label", { style: s.label }, "時間"),
          React.createElement("input", { style: s.input, type: "datetime-local", value: fundForm.time, onChange: e => setFundForm(f => ({ ...f, time: e.target.value })) }),
          React.createElement("label", { style: s.label }, "類型"),
          React.createElement("div", { style: { display: "flex", gap: 8 } },
            ["入金", "出金"].map(d => React.createElement("button", { key: d, onClick: () => setFundForm(f => ({ ...f, type: d })), style: { ...s.dirBtn, ...(fundForm.type === d ? (d === "入金" ? s.dirBuy : s.dirSell) : {}) } }, d))
          ),
          React.createElement("label", { style: s.label }, "金額"),
          React.createElement("input", { style: s.input, type: "number", placeholder: "金額", value: fundForm.amount, onChange: e => setFundForm(f => ({ ...f, amount: e.target.value })) })
        ),
        React.createElement("div", { style: s.formActions },
          React.createElement("button", { style: s.cancelBtn, onClick: () => setShowFF(false) }, "取消"),
          React.createElement("button", { style: { ...s.saveBtn, opacity: saving ? 0.6 : 1 }, onClick: addFund, disabled: saving }, saving ? "儲存中…" : "確認")
        )
      ),
      React.createElement("div", { style: s.tradeList },
        sortedFunds.map(f => React.createElement("div", { key: f.id, style: { ...s.tradeCard, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", { style: { ...s.badge, background: f.type === "入金" ? "#22c55e22" : "#ef444422", color: f.type === "入金" ? "#16a34a" : "#dc2626" } }, f.type),
          React.createElement("span", { style: s.tradeTime }, fmtDate(f.time)),
          React.createElement("span", { style: { marginLeft: "auto", fontWeight: 700, color: f.type === "入金" ? "#22c55e" : "#ef4444" } }, `${f.type === "入金" ? "+" : "-"}${Number(f.amount).toLocaleString()}`),
          React.createElement("button", { style: s.delBtn, onClick: () => saveFunds(funds.filter(x => x.id !== f.id)) }, "✕")
        ))
      )
    )
  );
}

function SummaryTab({ trades, pnlMap, balances }) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = now.toISOString().slice(0, 7);
  let todayPnl = 0, monthPnl = 0, totalPnl = 0;
  trades.forEach((t, i) => {
    const pnl = pnlMap[i];
    if (pnl == null) return;
    totalPnl += pnl;
    if (t.time.startsWith(monthStr)) monthPnl += pnl;
    if (t.time.startsWith(todayStr)) todayPnl += pnl;
  });
  const latestBal = [...balances].sort((a, b) => new Date(b.time) - new Date(a.time))[0];
  const closedCount = trades.filter((_, i) => pnlMap[i] !== null).length;
  const openCount = trades.filter((_, i) => pnlMap[i] === null).length;
  const pc = n => n > 0 ? "#22c55e" : n < 0 ? "#ef4444" : "#94a3b8";

  return React.createElement("div", null,
    React.createElement("div", { style: s.summaryGrid },
      [["今日損益", fmtMoney(todayPnl) + " 元", pc(todayPnl)], ["當月損益", fmtMoney(monthPnl) + " 元", pc(monthPnl)], ["累計損益", fmtMoney(totalPnl) + " 元", pc(totalPnl)], ["帳戶餘額", latestBal ? "$ " + Number(latestBal.amount).toLocaleString() : "—", "#38bdf8"], ["已平倉", closedCount + " 筆", "#94a3b8"], ["未平倉", openCount + " 筆", "#f59e0b"]].map(([label, value, color]) =>
        React.createElement("div", { key: label, style: s.summaryCard },
          React.createElement("div", { style: s.summaryLabel }, label),
          React.createElement("div", { style: { ...s.summaryValue, color } }, value)
        )
      )
    ),
    React.createElement("div", { style: s.section },
      React.createElement("div", { style: { ...s.sectionTitle, marginBottom: 10 } }, "近期平倉"),
      React.createElement("div", { style: s.tradeList },
        [...trades].sort((a, b) => new Date(b.time) - new Date(a.time)).filter(t => pnlMap[trades.indexOf(t)] !== null).slice(0, 10).map(t => {
          const pnl = pnlMap[trades.indexOf(t)];
          return React.createElement("div", { key: t.id, style: s.tradeCard },
            React.createElement("div", { style: s.tradeTop },
              React.createElement("span", { style: { ...s.badge, background: t.direction === "買進" ? "#22c55e22" : "#ef444422", color: t.direction === "買進" ? "#16a34a" : "#dc2626" } }, t.direction),
              React.createElement("span", { style: s.tradeProduct }, t.product + (t.product === "選擇權" ? ` ${t.expiry} ${t.strike}${t.cp}` : "")),
              React.createElement("span", { style: s.tradeTime }, fmtDate(t.time))
            ),
            React.createElement("div", { style: s.tradeBottom },
              React.createElement("span", { style: s.tradePrice }, `${Number(t.price).toLocaleString()} × ${t.qty}口`),
              React.createElement("span", { style: { ...s.pnlBadge, color: pnl >= 0 ? "#16a34a" : "#dc2626" } }, fmtMoney(pnl) + " 元")
            )
          );
        }),
        trades.filter(t => pnlMap[trades.indexOf(t)] !== null).length === 0 && React.createElement("div", { style: s.empty }, "尚無平倉紀錄")
      )
    )
  );
}

function ExportTab({ trades, pnlMap, funds, balances }) {
  const [copied, setCopied] = useState(false);

  function buildText() {
    let totalPnl = 0;
    trades.forEach((_, i) => { if (pnlMap[i] != null) totalPnl += pnlMap[i]; });
    const latestBal = [...balances].sort((a, b) => new Date(b.time) - new Date(a.time))[0];
    let txt = `📊 交易日誌 ${new Date().toLocaleString("zh-TW")}\n${"─".repeat(32)}\n`;
    txt += `累計損益：${fmtMoney(totalPnl)} 元\n`;
    if (latestBal) txt += `帳戶餘額：$ ${Number(latestBal.amount).toLocaleString()}\n`;
    txt += `\n【交易紀錄】\n`;
    [...trades].sort((a, b) => new Date(b.time) - new Date(a.time)).forEach(t => {
      const pnl = pnlMap[trades.indexOf(t)];
      const opts = t.product === "選擇權" ? ` | ${t.expiry} ${t.strike}${t.cp} ${t.side}` : "";
      txt += `${fmtDate(t.time)} | ${t.product} | ${t.direction} | ${t.qty}口 @ ${Number(t.price).toLocaleString()}${opts} → ${pnl != null ? fmtMoney(pnl) + " 元" : "未平倉"}\n`;
    });
    txt += `\n【出入金】\n`;
    [...funds].sort((a, b) => new Date(b.time) - new Date(a.time)).forEach(f => {
      txt += `${fmtDate(f.time)} | ${f.type} ${Number(f.amount).toLocaleString()}\n`;
    });
    return txt;
  }

  function copyText() {
    navigator.clipboard.writeText(buildText()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  function exportCSV() {
    let csv = "【交易紀錄】\n時間,商品,方向,口數,成交價,到期月,履約價,CP,買賣方,損益\n";
    [...trades].sort((a, b) => new Date(a.time) - new Date(b.time)).forEach(t => {
      const pnl = pnlMap[trades.indexOf(t)];
      csv += [fmtDate(t.time), t.product, t.direction, t.qty, t.price, t.expiry || "", t.strike || "", t.cp || "", t.side || "", pnl != null ? pnl : "未平倉"].join(",") + "\n";
    });
    csv += "\n【出入金】\n時間,類型,金額\n";
    [...funds].sort((a, b) => new Date(a.time) - new Date(b.time)).forEach(f => { csv += [fmtDate(f.time), f.type, f.amount].join(",") + "\n"; });
    csv += "\n【帳戶餘額歷史】\n時間,餘額\n";
    [...balances].sort((a, b) => new Date(a.time) - new Date(b.time)).forEach(b => { csv += [fmtDate(b.time), b.amount].join(",") + "\n"; });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `交易日誌_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return React.createElement("div", null,
    React.createElement("div", { style: { display: "flex", gap: 10, marginBottom: 16 } },
      React.createElement("button", { style: s.exportBtn, onClick: exportCSV }, "⬇ 下載 CSV"),
      React.createElement("button", { style: { ...s.exportBtn, background: copied ? "#16a34a" : "#334155" }, onClick: copyText }, copied ? "✓ 已複製" : "📋 複製文字版")
    ),
    React.createElement("div", { style: s.previewBox },
      React.createElement("div", { style: s.previewLabel }, "文字預覽（貼給 Claude 討論用）"),
      React.createElement("pre", { style: s.pre }, buildText())
    )
  );
}

const s = {
  app: { background: "#0f172a", minHeight: "100vh", color: "#e2e8f0", fontFamily: "'Courier New',monospace", maxWidth: 480, margin: "0 auto" },
  header: { background: "#1e293b", padding: "14px 20px", borderBottom: "1px solid #334155", display: "flex", alignItems: "center" },
  logo: { fontSize: 17, fontWeight: 700, letterSpacing: 1 },
  nav: { display: "flex", background: "#1e293b", borderBottom: "1px solid #334155", overflowX: "auto" },
  navBtn: { flex: 1, padding: "12px 4px", background: "none", border: "none", color: "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  navActive: { color: "#38bdf8", borderBottom: "2px solid #38bdf8" },
  main: { padding: "16px" },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  filterRow: { display: "flex", gap: 8 },
  chip: { padding: "4px 12px", borderRadius: 20, border: "1px solid #334155", background: "none", color: "#64748b", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  chipActive: { background: "#1e3a5f", color: "#38bdf8", borderColor: "#38bdf8" },
  addBtn: { padding: "8px 16px", background: "#38bdf8", color: "#0f172a", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 },
  formCard: { background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 16, border: "1px solid #334155" },
  formGrid: { display: "grid", gridTemplateColumns: "72px 1fr", gap: "10px 12px", alignItems: "center", marginBottom: 12 },
  label: { fontSize: 11, color: "#94a3b8", textAlign: "right" },
  input: { background: "#0f172a", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0", padding: "8px 10px", fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
  dirBtn: { flex: 1, padding: "8px 0", background: "#0f172a", border: "1px solid #334155", color: "#64748b", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13, minWidth: 56 },
  dirBuy: { background: "#14532d", borderColor: "#22c55e", color: "#22c55e" },
  dirSell: { background: "#7f1d1d", borderColor: "#ef4444", color: "#ef4444" },
  formActions: { display: "flex", gap: 8, justifyContent: "flex-end" },
  cancelBtn: { padding: "8px 16px", background: "none", border: "1px solid #334155", color: "#64748b", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  saveBtn: { padding: "8px 20px", background: "#38bdf8", color: "#0f172a", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  tradeList: { display: "flex", flexDirection: "column", gap: 8 },
  tradeCard: { background: "#1e293b", borderRadius: 10, padding: "12px 14px", border: "1px solid #334155" },
  tradeTop: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" },
  tradeBottom: { display: "flex", alignItems: "center", gap: 12 },
  badge: { padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 },
  tradeProduct: { fontSize: 13, fontWeight: 600, color: "#cbd5e1" },
  tradeDetail: { fontSize: 11, color: "#64748b" },
  tradeTime: { fontSize: 11, color: "#475569", marginLeft: "auto" },
  tradePrice: { fontSize: 12, color: "#94a3b8" },
  tradeQty: { fontSize: 12, color: "#94a3b8" },
  pnlBadge: { marginLeft: "auto", fontSize: 13, fontWeight: 700 },
  delBtn: { background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 13, padding: 0 },
  empty: { color: "#475569", textAlign: "center", padding: 32, fontSize: 13 },
  section: { marginBottom: 24 },
  sectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "#94a3b8", letterSpacing: 1 },
  balCard: { background: "#1e293b", borderRadius: 12, padding: "16px 20px", marginBottom: 12, border: "1px solid #38bdf833", display: "flex", alignItems: "center", justifyContent: "space-between" },
  balAmount: { fontSize: 22, fontWeight: 700, color: "#38bdf8" },
  balTime: { fontSize: 11, color: "#475569" },
  miniCard: { flex: 1, background: "#1e293b", borderRadius: 8, padding: "10px 8px", border: "1px solid #334155", display: "flex", flexDirection: "column", gap: 4 },
  miniLabel: { fontSize: 10, color: "#64748b" },
  summaryGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 },
  summaryCard: { background: "#1e293b", borderRadius: 10, padding: "14px 16px", border: "1px solid #334155" },
  summaryLabel: { fontSize: 11, color: "#64748b", marginBottom: 6 },
  summaryValue: { fontSize: 17, fontWeight: 700 },
  exportBtn: { flex: 1, padding: "12px", background: "#334155", color: "#e2e8f0", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13 },
  previewBox: { background: "#1e293b", borderRadius: 10, padding: 16, border: "1px solid #334155" },
  previewLabel: { fontSize: 11, color: "#64748b", marginBottom: 8 },
  pre: { fontSize: 11, color: "#94a3b8", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, lineHeight: 1.6 },
  spinner: { width: 28, height: 28, border: "3px solid #334155", borderTop: "3px solid #38bdf8", borderRadius: "50%", animation: "spin 1s linear infinite" },
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
