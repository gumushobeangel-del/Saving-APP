import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Bell, CalendarDays, Check,
  ChevronDown, CircleDollarSign, CreditCard, Ellipsis, FileChartColumnIncreasing,
  Flag, House, Leaf, LogOut, Menu, Plus, Search, Settings2, ShieldCheck,
  Sparkles, Target, TrendingDown, TrendingUp, Wallet, X,
} from "lucide-react";
import {
  ArcElement, BarElement, CategoryScale, Chart as ChartJS, Filler,
  Legend, LinearScale, LineElement, PointElement, Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import api, { clearTokens } from "./api";
import AuthScreen from "./components/AuthScreen";
import { getApiErrorMessage } from "./errorMessage";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Tooltip, Legend, Filler);

const EMPTY_DATA = {
  dashboard: { available_balance: 0, income_this_month: 0, expenses_this_month: 0, total_savings: 0, recent_transactions: [], month: "" },
  categories: [], income: [], expenses: [], budgets: [], goals: [], contributions: [],
};
const NAV_ITEMS = [
  { id: "dashboard", label: "Overview", icon: House },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "budgets", label: "Budgets", icon: CreditCard },
  { id: "goals", label: "Savings goals", icon: Target },
  { id: "reports", label: "Reports", icon: FileChartColumnIncreasing },
  { id: "categories", label: "Categories", icon: Flag },
];
const PAGE_META = {
  dashboard: ["Your overview", "Here\u2019s how your money is doing."],
  transactions: ["Transactions", "Keep track of every shilling coming in and going out."],
  budgets: ["Your budgets", "Give every shilling a thoughtful place to go."],
  goals: ["Savings goals", "Small steps today make a big difference tomorrow."],
  reports: ["Your reports", "A clearer picture of your financial habits."],
  categories: ["Categories", "Organise your income and expense categories."],
};

function amount(value) {
  return new Intl.NumberFormat("en-UG", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function requestError(error) {
  return getApiErrorMessage(error, "Something went wrong. Please check your connection and try again.");
}

function displayDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" });
}

function initials(user) {
  const first = user?.first_name?.[0] || user?.email?.[0] || "S";
  const last = user?.last_name?.[0] || "";
  return `${first}${last}`.toUpperCase();
}

function Toast({ toast, dismiss }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(dismiss, 3600);
    return () => window.clearTimeout(timer);
  }, [toast, dismiss]);
  if (!toast) return null;
  return <div className={`toast ${toast.type}`} role="status"><span className="toast-check"><Check size={15} /></span>{toast.message}<button aria-label="Dismiss notification" onClick={dismiss}><X size={15} /></button></div>;
}

function Modal({ title, subtitle, close, children, onSubmit, submitLabel, busy }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading"><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={close} aria-label="Close dialog"><X size={19} /></button></div>
        <form className="modal-form" onSubmit={onSubmit}>
          {children}
          <div className="modal-actions"><button type="button" className="button button-quiet" onClick={close}>Cancel</button><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Saving..." : submitLabel || "Save changes"}</button></div>
        </form>
      </section>
    </div>
  );
}

function Money({ value, compact = false }) {
  return <span className={compact ? "money-compact" : ""}>{amount(value)}</span>;
}

function StatCard({ title, value, icon: Icon, tone, helper, prefix = "UGX" }) {
  return (
    <article className="stat-card">
      <div className="stat-top"><span className="stat-label">{title}</span><span className={`stat-icon ${tone}`}><Icon size={18} /></span></div>
      <div className="stat-value"><span className="currency-prefix">{prefix}</span><Money value={value} /></div>
      <div className="stat-helper">{helper}</div>
    </article>
  );
}

function ProgressBar({ value, tone = "green" }) {
  const safeProgress = Math.min(100, Math.max(0, Number(value) || 0));
  return <div className={`progress-track ${tone}`}><span style={{ width: `${safeProgress}%` }} /></div>;
}

function EmptyState({ icon: Icon = Sparkles, title, detail, action, onAction }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={22} /></span><strong>{title}</strong><p>{detail}</p>{action && <button className="button button-soft" onClick={onAction}><Plus size={16} />{action}</button>}</div>;
}

function SectionHeading({ title, detail, action, onAction }) {
  return <div className="section-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action && <button className="button button-soft" onClick={onAction}><Plus size={16} />{action}</button>}</div>;
}

function TransactionRows({ rows, onEdit, onDelete, showActions = false }) {
  if (!rows.length) return <EmptyState icon={ArrowLeftRight} title="Nothing here just yet" detail="Add your first transaction and your activity will show up here." />;
  return (
    <div className="table-scroll"><table className="data-table">
      <thead><tr><th>Transaction</th><th>Category</th><th>Date</th><th className="amount-cell">Amount</th>{showActions && <th><span className="sr-only">Actions</span></th>}</tr></thead>
      <tbody>{rows.map((row) => {
        const isIncome = row.type === "income";
        const Icon = isIncome ? ArrowDownLeft : ArrowUpRight;
        return <tr key={`${row.type}-${row.id}`}>
          <td><div className="transaction-name"><span className={`transaction-icon ${isIncome ? "income" : "expense"}`}><Icon size={16} /></span><span><strong>{row.note || row.label || row.category_name}</strong><small>{isIncome ? "Money received" : "Money spent"}</small></span></div></td>
          <td><span className="category-pill">{row.label || row.category_name}</span></td>
          <td className="muted-cell">{displayDate(row.date)}</td>
          <td className={`amount-cell ${isIncome ? "positive" : ""}`}>{isIncome ? "+" : "\u2212"} UGX <Money value={row.amount} compact /></td>
          {showActions && <td><div className="row-actions"><button aria-label={`Edit ${row.note || row.label}`} onClick={() => onEdit(row)}><Settings2 size={16} /></button><button aria-label={`Delete ${row.note || row.label}`} onClick={() => onDelete(row.type, row.id)}><X size={16} /></button></div></td>}
        </tr>;
      })}</tbody>
    </table></div>
  );
}

function TransactionModal({ modal, categories, close, save, busy }) {
  const type = modal.type;
  const record = modal.record;
  const options = categories.filter((category) => category.kind === type);
  const title = `${record ? "Edit" : "Add"} ${type}`;
  return <Modal title={title} subtitle={type === "income" ? "Record money received." : "Record a purchase or payment."} close={close} onSubmit={(event) => save(event, "transaction")} submitLabel={record ? "Save transaction" : "Add transaction"} busy={busy}>
    {options.length === 0 && <div className="form-error">There are no {type} categories yet. Add one in the <strong>Categories</strong> page first.</div>}
    <div className="field-row"><label className="field"><span>Amount (UGX)</span><input name="amount" type="number" min="0.01" step="0.01" required defaultValue={record?.amount || ""} placeholder="e.g. 25000" /></label><label className="field"><span>Date</span><input name="date" type="date" required defaultValue={record?.date || localDate()} /></label></div>
    <label className="field"><span>Category</span><select name="category" required defaultValue={record?.category || options[0]?.id || ""}><option value="" disabled>Select a category</option>{options.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
    <label className="field"><span>Note <small>(optional)</small></span><input name="note" maxLength="240" defaultValue={record?.note || ""} placeholder={type === "income" ? "e.g. Monthly salary" : "e.g. Lunch with friends"} /></label>
  </Modal>;
}

function BudgetModal({ record, categories, close, save, busy }) {
  const expenseCategories = categories.filter((category) => category.kind === "expense");
  return <Modal title={`${record ? "Edit" : "Create"} a budget`} subtitle="Set a monthly spending limit for a category." close={close} onSubmit={(event) => save(event, "budget")} submitLabel={record ? "Save budget" : "Create budget"} busy={busy}>
    {expenseCategories.length === 0 && <div className="form-error">Create an expense category before setting a budget.</div>}
    <label className="field"><span>Category</span><select name="category" required defaultValue={record?.category || expenseCategories[0]?.id || ""}><option value="" disabled>Select a category</option>{expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
    <div className="field-row"><label className="field"><span>Monthly limit (UGX)</span><input name="amount" type="number" min="0.01" step="0.01" required defaultValue={record?.amount || ""} placeholder="e.g. 300000" /></label><label className="field"><span>Month</span><input name="month" type="month" required defaultValue={record?.month?.slice(0, 7) || localDate().slice(0, 7)} /></label></div>
  </Modal>;
}

function GoalModal({ record, close, save, busy }) {
  return <Modal title={`${record ? "Edit" : "Create"} a savings goal`} subtitle="Name something you would love to save for." close={close} onSubmit={(event) => save(event, "goal")} submitLabel={record ? "Save goal" : "Create goal"} busy={busy}>
    <label className="field"><span>Goal name</span><input name="title" maxLength="100" required defaultValue={record?.title || ""} placeholder="e.g. A rainy-day fund" /></label>
    <div className="field-row"><label className="field"><span>Target amount (UGX)</span><input name="target_amount" type="number" min="0.01" step="0.01" required defaultValue={record?.target_amount || ""} placeholder="e.g. 2000000" /></label><label className="field"><span>Target date <small>(optional)</small></span><input name="target_date" type="date" defaultValue={record?.target_date || ""} /></label></div>
  </Modal>;
}

function ContributionModal({ goal, close, save, busy }) {
  return <Modal title="Add to your savings" subtitle={`Every step counts towards ${goal.title}.`} close={close} onSubmit={(event) => save(event, "contribution")} submitLabel="Record contribution" busy={busy}>
    <label className="field"><span>Amount (UGX)</span><input name="amount" type="number" min="0.01" step="0.01" autoFocus required placeholder="e.g. 50000" /></label>
    <div className="field-row"><label className="field"><span>Date</span><input name="date" type="date" defaultValue={localDate()} required /></label><label className="field"><span>Note <small>(optional)</small></span><input name="note" maxLength="240" placeholder="e.g. Weekly savings" /></label></div>
  </Modal>;
}

function CategoryModal({ record, close, save, busy }) {
  const title = (record ? "Edit" : "Add") + " category";
  return <Modal title={title} subtitle="Categories help you sort your income and expenses." close={close} onSubmit={(event) => save(event, "category")} submitLabel={record ? "Save category" : "Add category"} busy={busy}>
    <label className="field"><span>Name</span><input name="name" maxLength="60" required defaultValue={record?.name || ""} placeholder="e.g. Groceries" /></label>
    <label className="field"><span>Type</span><select name="kind" required defaultValue={record?.kind || "expense"} disabled={!!record}><option value="income">Income</option><option value="expense">Expense</option></select></label>
    {record && <p className="form-hint">Category type cannot be changed once records exist.</p>}
  </Modal>;
}

function App() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(EMPTY_DATA);
  const [initialLoading, setInitialLoading] = useState(Boolean(localStorage.getItem("savewise_access")));
  const [pageError, setPageError] = useState("");
  const [activePage, setActivePage] = useState("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reportPeriod, setReportPeriod] = useState("monthly");
  const [report, setReport] = useState({ results: [] });
  const [search, setSearch] = useState("");

  const dismissToast = useCallback(() => setToast(null), []);

  const loadData = useCallback(async () => {
    const [profile, dashboardResponse, categories, income, expenses, budgets, goals, contributions] = await Promise.all([
      api.get("profile/"), api.get("dashboard/"), api.get("categories/"), api.get("income/"),
      api.get("expenses/"), api.get("budgets/"), api.get("goals/"), api.get("contributions/"),
    ]);
    setUser(profile.data);
    setData({
      dashboard: dashboardResponse.data,
      categories: categories.data,
      income: income.data,
      expenses: expenses.data,
      budgets: budgets.data,
      goals: goals.data,
      contributions: contributions.data,
    });
    setPageError("");
    setInitialLoading(false);
  }, []);

  useEffect(() => {
    const onLogout = () => {
      setUser(null);
      setData(EMPTY_DATA);
      setInitialLoading(false);
    };
    window.addEventListener("savewise:logout", onLogout);
    if (localStorage.getItem("savewise_access")) {
      loadData().catch((error) => {
        if (error.response?.status !== 401) setPageError(requestError(error));
        setInitialLoading(false);
      });
    }
    return () => window.removeEventListener("savewise:logout", onLogout);
  }, [loadData]);

  useEffect(() => {
    if (!user || !["dashboard", "reports"].includes(activePage)) return;
    const period = activePage === "dashboard" ? "monthly" : reportPeriod;
    api.get(`reports/?period=${period}`).then(({ data: result }) => setReport(result)).catch((error) => setToast({ type: "error", message: requestError(error) }));
  }, [user, activePage, reportPeriod, data]);

  const transactions = useMemo(() => [
    ...data.income.map((item) => ({ ...item, type: "income" })),
    ...data.expenses.map((item) => ({ ...item, type: "expense" })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id), [data.income, data.expenses]);

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? transactions.filter((item) => `${item.note} ${item.category_name} ${item.type}`.toLowerCase().includes(query)) : transactions;
  }, [transactions, search]);

  async function refreshData() {
    try {
      await loadData();
    } catch (error) {
      setToast({ type: "error", message: requestError(error) });
      throw error;
    }
  }

  async function signOut() {
    const refresh = localStorage.getItem("savewise_refresh");
    clearTokens();
    setUser(null);
    setData(EMPTY_DATA);
    setActivePage("dashboard");
    setToast(null);
    if (refresh) {
      try {
        await api.post("auth/logout/", { refresh });
      } catch (error) {
        setToast({ type: "error", message: `You're signed out on this device, but the server could not revoke the session. ${requestError(error)}` });
      }
    }
  }

  function openModal(value) {
    setModal(value);
  }

  async function saveForm(event, kind) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const values = Object.fromEntries(formData.entries());
    if (kind === "budget") values.month = `${values.month}-01`;
    if (kind === "goal" && !values.target_date) values.target_date = null;
    const resource = kind === "transaction" ? (modal.type === "income" ? "income" : "expenses") : kind === "goal" ? "goals" : kind === "contribution" ? "contributions" : kind === "category" ? "categories" : "budgets";
    const payload = kind === "transaction" ? { ...values, category: Number(values.category) } : kind === "budget" ? { ...values, category: Number(values.category) } : kind === "contribution" ? { ...values, goal: modal.goal.id } : values;
    const endpoint = `${resource}/`;
    setSaving(true);
    try {
      if (modal.record) await api.put(`${endpoint}${modal.record.id}/`, payload);
      else await api.post(endpoint, payload);
      await refreshData();
      setModal(null);
      setToast({ type: "success", message: kind === "contribution" ? "Your savings contribution was recorded." : `${kind === "transaction" ? modal.type : kind} ${modal.record ? "updated" : "saved"} successfully.` });
    } catch (error) {
      setToast({ type: "error", message: requestError(error) });
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(resource, id) {
    if (!window.confirm("Are you sure you want to delete this? This change cannot be undone.")) return;
    try {
      await api.delete(`${resource}/${id}/`);
      await refreshData();
      setToast({ type: "success", message: "Deleted successfully." });
    } catch (error) {
      setToast({ type: "error", message: requestError(error) });
    }
  }

  function editTransaction(row) {
    openModal({ kind: "transaction", type: row.type, record: row });
  }

  function changePage(page) {
    setActivePage(page);
    setMobileNavOpen(false);
    setSearch("");
  }

  if (!user && initialLoading) {
    return <div className="loading-screen"><span className="brand-mark"><Leaf size={18} /></span><span>Getting your finances ready...</span>{pageError && <><p className="load-error">{pageError}</p><button className="button button-soft" onClick={() => { setInitialLoading(true); loadData().catch((error) => { setPageError(requestError(error)); setInitialLoading(false); }); }}>Try again</button></>}</div>;
  }
  if (!user) return <><AuthScreen onAuthenticated={() => { setInitialLoading(true); loadData().catch((error) => { setPageError(requestError(error)); setInitialLoading(false); }); }} /><Toast toast={toast} dismiss={dismissToast} /></>;

  const [pageTitle, pageDescription] = PAGE_META[activePage];
  const budgetAlerts = data.budgets.filter((budget) => budget.month.slice(0, 7) === localDate().slice(0, 7) && Number(budget.progress) >= 80);

  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="mobile-backdrop" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand"><span className="brand-mark"><Leaf size={18} /></span><span>savewise</span></div>
        <div className="sidebar-label">MENU</div>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-link ${activePage === id ? "selected" : ""}`} onClick={() => changePage(id)}><Icon size={19} strokeWidth={activePage === id ? 2.2 : 1.8} /><span>{label}</span>{id === "budgets" && budgetAlerts.length > 0 && <span className="nav-count">{budgetAlerts.length}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><span className="tip-icon"><Sparkles size={16} /></span><strong>Good money habits</strong><p>Little by little, a little becomes a lot.</p></div>
          <button className="profile-menu" onClick={signOut}><span className="avatar">{initials(user)}</span><span className="profile-copy"><strong>{user.first_name || user.email.split("@")[0]}</strong><small>Personal account</small></span><LogOut size={17} className="logout-icon" /></button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{pageTitle}</strong></div>
          <div className="topbar-right"><span className="secure-chip"><ShieldCheck size={15} />Your data is private</span><span className="topbar-divider" /><button className="notification-button" title={budgetAlerts.length ? `${budgetAlerts.length} budgets need attention` : "Notifications"} onClick={() => { if (budgetAlerts.length) changePage("budgets"); else setToast({ type: "success", message: "You're all caught up. No budget alerts." }); }}><Bell size={18} />{budgetAlerts.length > 0 && <i />}</button><span className="avatar top-avatar">{initials(user)}</span></div>
        </header>
        <div className="page-content">
          <div className="page-heading"><div><span className="eyebrow">{activePage === "dashboard" ? "GOOD TO SEE YOU" : "YOUR FINANCES"}</span><h1>{activePage === "dashboard" ? `Hello${user.first_name ? `, ${user.first_name}` : ""}.` : pageTitle}</h1><p>{pageDescription}</p></div>{activePage === "transactions" ? <div className="button-group"><button className="button button-quiet" onClick={() => openModal({ kind: "transaction", type: "expense" })}><ArrowUpRight size={17} /> Add expense</button><button className="button button-primary" onClick={() => openModal({ kind: "transaction", type: "income" })}><Plus size={17} /> Add income</button></div> : activePage === "budgets" ? <button className="button button-primary" onClick={() => openModal({ kind: "budget" })}><Plus size={17} /> New budget</button> : activePage === "goals" ? <button className="button button-primary" onClick={() => openModal({ kind: "goal" })}><Plus size={17} /> New goal</button> : activePage === "categories" ? <button className="button button-primary" onClick={() => openModal({ kind: "category" })}><Plus size={17} /> New category</button> : null}</div>
          {pageError && <div className="page-alert" role="alert">{pageError}<button onClick={() => { setPageError(""); loadData().catch((error) => setPageError(requestError(error))); }}>Try again</button></div>}
          {activePage === "dashboard" && <DashboardPage data={data} report={report} onPage={changePage} onAdd={() => openModal({ kind: "transaction", type: "expense" })} onAddIncome={() => openModal({ kind: "transaction", type: "income" })} onEdit={editTransaction} onDelete={deleteItem} />}
          {activePage === "transactions" && <TransactionsPage rows={filteredTransactions} search={search} setSearch={setSearch} onAdd={() => openModal({ kind: "transaction", type: "expense" })} onEdit={editTransaction} onDelete={deleteItem} />}
          {activePage === "budgets" && <BudgetsPage budgets={data.budgets} onAdd={() => openModal({ kind: "budget" })} onEdit={(record) => openModal({ kind: "budget", record })} onDelete={(id) => deleteItem("budgets", id)} />}
          {activePage === "goals" && <GoalsPage goals={data.goals} contributions={data.contributions} onAdd={() => openModal({ kind: "goal" })} onEdit={(record) => openModal({ kind: "goal", record })} onContribute={(goal) => openModal({ kind: "contribution", goal })} onDelete={(id) => deleteItem("goals", id)} onDeleteContribution={(id) => deleteItem("contributions", id)} />}
          {activePage === "reports" && <ReportsPage report={report} period={reportPeriod} setPeriod={setReportPeriod} transactions={transactions} />}
          {activePage === "categories" && <CategoriesPage categories={data.categories} onAdd={() => openModal({ kind: "category" })} onEdit={(record) => openModal({ kind: "category", record })} onDelete={(id) => deleteItem("categories", id)} />}
          <footer className="page-footer"><span>Made for a more mindful relationship with money.</span><span>SaveWise <b>&middot;</b> UGX</span></footer>
        </div>
      </main>
      {modal?.kind === "transaction" && <TransactionModal modal={modal} categories={data.categories} close={() => setModal(null)} save={saveForm} busy={saving} />}
      {modal?.kind === "budget" && <BudgetModal record={modal.record} categories={data.categories} close={() => setModal(null)} save={saveForm} busy={saving} />}
      {modal?.kind === "goal" && <GoalModal record={modal.record} close={() => setModal(null)} save={saveForm} busy={saving} />}
      {modal?.kind === "contribution" && <ContributionModal goal={modal.goal} close={() => setModal(null)} save={saveForm} busy={saving} />}
      {modal?.kind === "category" && <CategoryModal record={modal.record} close={() => setModal(null)} save={saveForm} busy={saving} />}
      <Toast toast={toast} dismiss={dismissToast} />
    </div>
  );
}

function DashboardPage({ data, report, onPage, onAdd, onAddIncome, onEdit, onDelete }) {
  const stats = data.dashboard;
  return <>
    <section className="stats-grid">
      <StatCard title="Available balance" value={stats.available_balance} icon={Wallet} tone="green" helper="After spending & savings" />
      <StatCard title="Income this month" value={stats.income_this_month} icon={TrendingUp} tone="mint" helper={stats.month || "This month"} />
      <StatCard title="Spent this month" value={stats.expenses_this_month} icon={TrendingDown} tone="peach" helper={stats.month || "This month"} />
      <StatCard title="Total savings" value={stats.total_savings} icon={Target} tone="lavender" helper="Across all your goals" />
    </section>
    <section className="dashboard-grid">
      <article className="panel spending-panel">
        <div className="panel-heading"><div><span className="eyebrow">YOUR CASH FLOW</span><h2>Income &amp; spending</h2><p>A view of the last six months</p></div><button className="icon-button subtle-button" aria-label="View reports" onClick={() => onPage("reports")}><Ellipsis size={20} /></button></div>
        {report.results?.some((item) => Number(item.income) || Number(item.expenses)) ? <div className="chart-area"><Bar data={{ labels: report.results.map((item) => item.label), datasets: [
          { label: "Income", data: report.results.map((item) => item.income), backgroundColor: "#2b7550", borderRadius: 5, maxBarThickness: 26 },
          { label: "Expenses", data: report.results.map((item) => item.expenses), backgroundColor: "#dce9df", borderRadius: 5, maxBarThickness: 26 },
        ] }} options={barOptions} /></div> : <div className="chart-empty"><span className="chart-empty-icon"><FileChartColumnIncreasing size={23} /></span><strong>Your story starts here</strong><span>Add income or an expense to see your cash flow.</span><button className="button button-soft" onClick={onAddIncome}><Plus size={15} /> Add income</button></div>}
        <div className="chart-legend"><span><i className="legend-income" /> Income</span><span><i className="legend-expense" /> Expenses</span><button onClick={() => onPage("reports")}>See full report <ArrowRightIcon /></button></div>
      </article>
      <article className="panel quick-panel">
        <div className="panel-heading"><div><span className="eyebrow">QUICK ACTION</span><h2>Make a move</h2><p>Small actions, steady progress.</p></div></div>
        <button className="quick-action" onClick={onAddIncome}><span className="quick-icon quick-income"><ArrowDownLeft size={18} /></span><span><strong>Add income</strong><small>Log money received</small></span><Plus size={16} className="quick-plus" /></button>
        <button className="quick-action" onClick={onAdd}><span className="quick-icon quick-expense"><ArrowUpRight size={18} /></span><span><strong>Record an expense</strong><small>Keep spending on track</small></span><Plus size={16} className="quick-plus" /></button>
        <button className="quick-action" onClick={() => onPage("goals")}><span className="quick-icon quick-goal"><Target size={18} /></span><span><strong>Check your goals</strong><small>See how far you've come</small></span><Plus size={16} className="quick-plus" /></button>
        <div className="quick-note"><Leaf size={15} /><span>Every shilling you track is a step towards clarity.</span></div>
      </article>
    </section>
    <section className="panel recent-panel"><SectionHeading title="Recent transactions" detail="Your latest money moves." action="All transactions" onAction={() => onPage("transactions")} /><TransactionRows rows={stats.recent_transactions || []} onEdit={onEdit} onDelete={onDelete} /></section>
  </>;
}

function ArrowRightIcon() {
  return <span aria-hidden="true">&rarr;</span>;
}

function TransactionsPage({ rows, search, setSearch, onAdd, onEdit, onDelete }) {
  return <section className="panel table-panel">
    <div className="table-toolbar"><div><div className="toolbar-title"><h2>All transactions</h2><span className="result-count">{rows.length}</span></div><p>Income and expenses, all in one place.</p></div><div className="table-controls"><label className="search-field"><Search size={16} /><input placeholder="Search transactions" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>&#8984; K</kbd></label><button className="button button-primary" onClick={onAdd}><Plus size={16} /> Add expense</button></div></div>
    <TransactionRows rows={rows} onEdit={onEdit} onDelete={onDelete} showActions />
    {rows.length > 0 && <div className="table-footer">Showing {rows.length} {rows.length === 1 ? "transaction" : "transactions"} <span>All amounts in Ugandan shillings</span></div>}
  </section>;
}

function BudgetsPage({ budgets, onAdd, onEdit, onDelete }) {
  const sortedBudgets = [...budgets].sort((a, b) => b.month.localeCompare(a.month));
  if (!budgets.length) return <section className="panel"><EmptyState icon={CreditCard} title="A fresh start for your budget" detail="Set a monthly spending limit to understand where your money goes." action="Create your first budget" onAction={onAdd} /></section>;
  return <section className="budget-grid">{sortedBudgets.map((budget) => {
    const progress = Number(budget.progress);
    const exceeded = progress >= 100;
    const warning = progress >= 80;
    return <article className="panel budget-card" key={budget.id}>
      <div className="budget-card-top"><span className={`budget-category-icon ${exceeded ? "danger" : warning ? "warning" : ""}`}><CreditCard size={19} /></span><div className="budget-actions"><button onClick={() => onEdit(budget)} aria-label={`Edit ${budget.category_name} budget`}><Settings2 size={17} /></button><button onClick={() => onDelete(budget.id)} aria-label={`Delete ${budget.category_name} budget`}><X size={17} /></button></div></div>
      <div className="budget-name">{budget.category_name}</div><div className="budget-month"><CalendarDays size={14} />{new Date(`${budget.month}T00:00:00`).toLocaleDateString("en-UG", { month: "long", year: "numeric" })}</div>
      <div className="budget-amounts"><strong>UGX <Money value={budget.spent} compact /></strong><span>of UGX <Money value={budget.amount} compact /></span></div>
      <ProgressBar value={progress} tone={exceeded ? "red" : warning ? "amber" : "green"} />
      <div className={`budget-foot ${exceeded ? "text-danger" : warning ? "text-warning" : ""}`}><span>{exceeded ? "Over budget" : warning ? "Getting close" : "Looking good"}</span><strong>{Math.round(progress)}%</strong></div>
    </article>;
  })}</section>;
}

function GoalsPage({ goals, contributions, onAdd, onEdit, onContribute, onDelete, onDeleteContribution }) {
  const totalSaved = goals.reduce((sum, goal) => sum + Number(goal.saved_amount || 0), 0);
  const totalTarget = goals.reduce((sum, goal) => sum + Number(goal.target_amount || 0), 0);
  return <>
    {goals.length > 0 && <section className="goal-summary"><div className="goal-summary-icon"><Target size={20} /></div><div><span>Across your goals</span><strong>UGX {amount(totalSaved)} <small>saved of UGX {amount(totalTarget)}</small></strong></div><div className="goal-summary-progress"><ProgressBar value={totalTarget ? totalSaved / totalTarget * 100 : 0} /><span>{totalTarget ? Math.min(100, Math.round(totalSaved / totalTarget * 100)) : 0}% of your total target</span></div></section>}
    {!goals.length ? <section className="panel"><EmptyState icon={Target} title="Give your savings a purpose" detail="Create a goal for something that matters to you, then build it one contribution at a time." action="Create your first goal" onAction={onAdd} /></section> : <section className="goal-grid">{goals.map((goal, index) => {
      const progress = Number(goal.progress);
      const relatedContributions = contributions.filter((item) => item.goal === goal.id);
      return <article className="panel goal-card" key={goal.id}>
        <div className="goal-card-top"><span className={`goal-symbol goal-symbol-${index % 4}`}><Target size={19} /></span><div className="budget-actions"><button onClick={() => onEdit(goal)} aria-label={`Edit ${goal.title}`}><Settings2 size={17} /></button><button onClick={() => onDelete(goal.id)} aria-label={`Delete ${goal.title}`}><X size={17} /></button></div></div>
        <h3>{goal.title}</h3><div className="goal-target"><span>UGX <Money value={goal.saved_amount} compact /></span><span>of UGX <Money value={goal.target_amount} compact /></span></div>
        <ProgressBar value={progress} tone="green" />
        <div className="goal-progress-caption"><span>{Math.min(100, Math.round(progress))}% there</span><span>{goal.target_date ? `By ${displayDate(goal.target_date)}` : "No target date"}</span></div>
        <button className="button button-soft contribute-button" onClick={() => onContribute(goal)}><Plus size={16} /> Add contribution</button>
        {relatedContributions.length > 0 && <div className="contribution-list"><span className="contribution-title">RECENT CONTRIBUTIONS</span>{relatedContributions.slice(0, 3).map((item) => <div key={item.id}><span>{displayDate(item.date)}{item.note ? ` \u00b7 ${item.note}` : ""}</span><span>UGX {amount(item.amount)}<button aria-label="Delete contribution" onClick={() => onDeleteContribution(item.id)}><X size={13} /></button></span></div>)}</div>}
      </article>;
    })}</section>}
  </>;
}

const chartTooltip = { backgroundColor: "#203a2e", padding: 12, titleFont: { family: "DM Sans", size: 12 }, bodyFont: { family: "DM Sans", size: 12 }, cornerRadius: 10, displayColors: true, callbacks: { label: (context) => ` UGX ${amount(context.parsed.y)}` } };
const barOptions = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: chartTooltip },
  scales: {
    x: { grid: { display: false }, border: { display: false }, ticks: { color: "#8a928c", font: { family: "DM Sans", size: 11 } } },
    y: { beginAtZero: true, grid: { color: "#edf0ed", drawTicks: false }, border: { display: false, dash: [4, 5] }, ticks: { color: "#9ba19c", padding: 10, font: { family: "DM Sans", size: 10 }, callback: (value) => value === 0 ? "0" : `${Math.round(value / 1000)}k` } },
  },
};

function ReportsPage({ report, period, setPeriod, transactions }) {
  const results = report.results || [];
  const totalIncome = results.reduce((sum, item) => sum + Number(item.income || 0), 0);
  const totalExpenses = results.reduce((sum, item) => sum + Number(item.expenses || 0), 0);
  const expenseCategories = transactions.filter((item) => item.type === "expense").reduce((groups, item) => {
    const name = item.category_name || "Other";
    groups[name] = (groups[name] || 0) + Number(item.amount);
    return groups;
  }, {});
  const categories = Object.entries(expenseCategories).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const palette = ["#2b7550", "#78ad8a", "#b6cbb9", "#d1a878", "#c5b7d6"];
  const trendData = {
    labels: results.map((item) => item.label),
    datasets: [
      { label: "Income", data: results.map((item) => item.income), borderColor: "#2b7550", backgroundColor: "rgba(43,117,80,.08)", fill: true, tension: .35, pointRadius: 3, pointHoverRadius: 5 },
      { label: "Expenses", data: results.map((item) => item.expenses), borderColor: "#bd8b69", backgroundColor: "rgba(189,139,105,.05)", fill: true, tension: .35, pointRadius: 3, pointHoverRadius: 5 },
    ],
  };
  return <>
    <section className="report-controls"><div><h2>Income &amp; expenses</h2><p>Compare your money in and money out.</p></div><div className="period-switch"><button className={period === "weekly" ? "active" : ""} onClick={() => setPeriod("weekly")}>This week</button><button className={period === "monthly" ? "active" : ""} onClick={() => setPeriod("monthly")}>6 months</button></div></section>
    <section className="report-stats"><StatCard title="Income in period" value={totalIncome} icon={ArrowDownLeft} tone="mint" helper={period === "weekly" ? "Last 7 days" : "Last 6 months"} /><StatCard title="Expenses in period" value={totalExpenses} icon={ArrowUpRight} tone="peach" helper={period === "weekly" ? "Last 7 days" : "Last 6 months"} /><StatCard title="Difference" value={totalIncome - totalExpenses} icon={CircleDollarSign} tone="green" helper="Income less expenses" /></section>
    <section className="report-charts"><article className="panel report-line-panel"><div className="panel-heading"><div><span className="eyebrow">YOUR MONEY OVER TIME</span><h2>Income &amp; spending trend</h2></div></div>{totalIncome || totalExpenses ? <div className="line-chart"><Line data={trendData} options={{ ...barOptions, elements: { line: { borderWidth: 2 } } }} /></div> : <EmptyState icon={FileChartColumnIncreasing} title="No trends to show" detail="Add transactions to see your income and spending over time." />}</article>
      <article className="panel category-panel"><div className="panel-heading"><div><span className="eyebrow">WHERE IT GOES</span><h2>Top spending categories</h2></div></div>{categories.length ? <div className="category-breakdown">{categories.map(([name, value], index) => <div className="category-breakdown-row" key={name}><span className="category-dot" style={{ backgroundColor: palette[index] }} /><span className="category-breakdown-name">{name}</span><span className="category-breakdown-amount">UGX {amount(value)}</span></div>)}</div> : <div className="category-empty"><span className="empty-icon"><Sparkles size={20} /></span><p>Your category breakdown will appear here as you record expenses.</p></div>}<div className="category-footnote">Based on all recorded expenses</div></article>
    </section>
  </>;
}

function CategoriesPage({ categories, onAdd, onEdit, onDelete }) {
  const income = categories.filter((c) => c.kind === "income");
  const expense = categories.filter((c) => c.kind === "expense");
  return <>
    <div className="categories-grid">
      <section className="panel categories-panel">
        <div className="panel-heading" style={{ padding: "18px 18px 0" }}><div><span className="eyebrow">INCOME</span><h2>Income categories</h2><p>Where your money comes from.</p></div><span className="result-count" style={{ marginTop: 8 }}>{income.length}</span></div>
        {income.length === 0 ? <EmptyState icon={ArrowDownLeft} title="No income categories yet" detail="Add a category to track where your income comes from." action="Add income category" onAction={onAdd} /> :
          <div className="category-list">{income.map((cat) => <div key={cat.id} className="category-row">
            <span className="cat-icon cat-income"><ArrowDownLeft size={15} /></span>
            <span className="cat-name">{cat.name}</span>
            <div className="row-actions"><button aria-label={"Edit " + cat.name} onClick={() => onEdit(cat)}><Settings2 size={15} /></button><button aria-label={"Delete " + cat.name} onClick={() => onDelete(cat.id)}><X size={15} /></button></div>
          </div>)}</div>
        }
      </section>
      <section className="panel categories-panel">
        <div className="panel-heading" style={{ padding: "18px 18px 0" }}><div><span className="eyebrow">EXPENSE</span><h2>Expense categories</h2><p>Where your money goes.</p></div><span className="result-count" style={{ marginTop: 8 }}>{expense.length}</span></div>
        {expense.length === 0 ? <EmptyState icon={ArrowUpRight} title="No expense categories yet" detail="Add a category to group your expenses." action="Add expense category" onAction={onAdd} /> :
          <div className="category-list">{expense.map((cat) => <div key={cat.id} className="category-row">
            <span className="cat-icon cat-expense"><ArrowUpRight size={15} /></span>
            <span className="cat-name">{cat.name}</span>
            <div className="row-actions"><button aria-label={"Edit " + cat.name} onClick={() => onEdit(cat)}><Settings2 size={15} /></button><button aria-label={"Delete " + cat.name} onClick={() => onDelete(cat.id)}><X size={15} /></button></div>
          </div>)}</div>
        }
      </section>
    </div>
  </>;
}

export default App;
