import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, collection, deleteDoc } from 'firebase/firestore';
import {
  CheckCircle2, ChevronRight, ChevronLeft, UploadCloud, RotateCcw, Send, PackageCheck,
  Wifi, WifiOff, Clock, CheckCircle, Layout, Image as ImageIcon, ClipboardList,
  Search, MessageSquareText, Trash2, Save, Eye, X, FileText, CalendarClock,
  Navigation, Info, ArrowLeft, Plus, Calendar, AlertTriangle, User, Hash, Filter,
  ArrowRight, Loader2, MapPin, Ruler
} from 'lucide-react';

// --- Firebase 配置 ---
const firebaseConfig = JSON.parse((window as any).__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'inspection-master-pro';

// --- 業務常數 ---
const STEPS_PER_WO = [
  { id: 1, title: "Blind overview - Closed slat", description: "盲窗概覽：請確認葉片處於「完全閉合」狀態，檢查整體外觀與遮光性。" },
  { id: 2, title: "Blind overview - Opened slat", description: "盲窗概覽：請確認葉片處於「開啟」狀態，檢查梯繩平整度與運作順暢度。" },
  { id: 3, title: "Bottom rail label", description: "底軌標籤：請清晰拍攝底軌上的產品標籤，須包含規格、序號與製造資訊。" },
  { id: 4, title: "Completed package", description: "成品包裝：請拍攝產品裝箱後的封箱狀態、外箱標籤與保護材配置。" }
];

const SHIP_TO_LIST = ["AS5645", "AS5752", "ASGUS6", "TG0075", "TG0083", "TG0099"];

const getTodayDate = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
};

const formatDate = (dateString: string | Date | undefined) => {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
};

const createInitialWorkOrders = () => ([
  {
    wo_id: "WO-01",
    customer_id: "",
    prod_date: getTodayDate(),
    inspect_date: getTodayDate(),
    size: "",
    color: "",
    prod_qty: "",
    inspect_qty: "",
    failed_qty: "0",
    result: "合格",
    steps: STEPS_PER_WO.map(s => ({ ...s, checked: false, photoUrl: null, remarks: "" }))
  }
]);

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [viewMode, setViewMode] = useState('home');
  const [ordersSummary, setOrdersSummary] = useState<any[]>([]);
  const [currentPoId, setCurrentPoId] = useState<string | null>(null);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [poStatus, setPoStatus] = useState('DRAFT');

  const [activeWoIndex, setActiveWoIndex] = useState(0);
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [shipToFilter, setShipToFilter] = useState("");

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showToast, setShowToast] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newPoInput, setNewPoInput] = useState("");
  const [newShipToInput, setNewShipToInput] = useState(SHIP_TO_LIST[0]);
  const [isCreating, setIsCreating] = useState(false);

  const [woToDelete, setWoToDelete] = useState<{ index: number, id: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof (window as any).__initial_auth_token !== 'undefined' && (window as any).__initial_auth_token) {
          await signInWithCustomToken(auth, (window as any).__initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { console.error("Auth Error", err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      if (!isLoading) return;
      const mockTimer = setTimeout(() => {
        // If we are still loading and no user, stop loading to show UI
        if (isLoading) setIsLoading(false);
      }, 2000);
      return () => clearTimeout(mockTimer);
    }
    const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'orders');
    const unsubscribe = onSnapshot(ordersRef, (snapshot) => {
      const summaries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setOrdersSummary(summaries);
      setIsLoading(false);
    }, (err) => {
      console.error("Firestore List Error:", err);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user || !currentPoId) return;
    const poRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentPoId);
    const unsubscribe = onSnapshot(poRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setWorkOrders(data.workOrders || []);
        setPoStatus(data.status || 'DRAFT');
      }
    });
    return () => unsubscribe();
  }, [user, currentPoId]);

  useEffect(() => {
    if (editScrollRef.current) {
      editScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeStepIndex, activeWoIndex, viewMode]);

  const syncToCloud = async (updatedWorkOrders: any[], status = 'DRAFT') => {
    if (!user || !currentPoId) return;
    const poRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentPoId);
    try {
      await updateDoc(poRef, {
        workOrders: updatedWorkOrders,
        status: status,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid
      });
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) { console.error("Sync Error", err); }
  };

  const handleCreateOrder = async () => {
    if (!newPoInput || isCreating) return;
    setIsCreating(true);
    const poId = newPoInput.trim().toUpperCase();
    const poRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', poId);
    const initialData = {
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedBy: user?.uid || 'guest',
      shipTo: newShipToInput,
      workOrders: createInitialWorkOrders()
    };

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out")), 2000)
    );

    try {
      await Promise.race([setDoc(poRef, initialData), timeoutPromise]);
      setCurrentPoId(poId);
      setActiveWoIndex(0);
      setActiveStepIndex(0);
      setViewMode('edit');
      setShowAddModal(false);
      setNewPoInput("");
    } catch (err) {
      console.error("Create Fail or Timeout", err);
      setCurrentPoId(poId);
      setWorkOrders(initialData.workOrders);
      setOrdersSummary(prev => {
        if (prev.find(o => o.id === poId)) return prev;
        return [{ id: poId, ...initialData }, ...prev];
      });
      setActiveWoIndex(0);
      setActiveStepIndex(0);
      setViewMode('edit');
      setShowAddModal(false);
      setNewPoInput("");
    } finally { setIsCreating(false); }
  };

  const confirmDeleteWO = async () => {
    if (woToDelete === null || !currentPoId) return;
    const index = woToDelete.index;
    const poRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentPoId);
    if (workOrders.length <= 1) {
      try {
        setWoToDelete(null);
        await deleteDoc(poRef);
        setWorkOrders([]);
        setCurrentPoId(null);
        setViewMode('home');
      } catch (err) { console.error("Delete PO Fail", err); }
    } else {
      try {
        const newOrders = workOrders.filter((_, i) => i !== index);
        if (activeWoIndex >= newOrders.length) { setActiveWoIndex(Math.max(0, newOrders.length - 1)); }
        setActiveStepIndex(0);
        setWoToDelete(null);
        await syncToCloud(newOrders);
        setWorkOrders(newOrders);
      } catch (err) { console.error("Remove WO Fail", err); }
    }
  };

  const updateActiveWOField = (field: string, value: any) => {
    if (!workOrders[activeWoIndex]) return;
    const newOrders = [...workOrders];
    // 日期欄位需要將 - 轉換成 / 以維持 yyyy/MM/dd 格式
    let formattedValue = value;
    if (field === 'prod_date' || field === 'inspect_date') {
      formattedValue = value?.replace(/-/g, '/');
    }
    newOrders[activeWoIndex] = { ...newOrders[activeWoIndex], [field]: formattedValue };
    setWorkOrders(newOrders);
    syncToCloud(newOrders);
  };

  const updateActiveStep = (updates: any) => {
    if (!workOrders[activeWoIndex]) return;
    const newOrders = [...workOrders];
    const targetWO = { ...newOrders[activeWoIndex] };
    if (!targetWO.steps) return;
    targetWO.steps[activeStepIndex] = { ...targetWO.steps[activeStepIndex], ...updates };
    newOrders[activeWoIndex] = targetWO;
    setWorkOrders(newOrders);
    if (!updates.isUploading) syncToCloud(newOrders);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    updateActiveStep({ isUploading: true });
    setTimeout(() => {
      const mockUrl = `https://picsum.photos/seed/${currentPoId}-${activeWoIndex}-${activeStepIndex}-${Date.now()}/1200/800`;
      updateActiveStep({ photoUrl: mockUrl, isUploading: false, checked: true });
      if (fileInputRef.current) fileInputRef.current.value = "";
    }, 1200);
  };

  const activeWO = useMemo(() => workOrders[activeWoIndex] || null, [workOrders, activeWoIndex]);
  const activeStep = useMemo(() => activeWO?.steps?.[activeStepIndex] || null, [activeWO, activeStepIndex]);
  const isSubmitted = poStatus === 'SUBMITTED';

  const filteredOrdersSummary = useMemo(() => {
    return ordersSummary.filter(o => {
      const matchesSearch = o.id.toLowerCase().includes(searchTerm.toLowerCase());
      const orderDate = o.createdAt?.split('T')[0] || "";
      const matchesShipTo = !shipToFilter || o.shipTo === shipToFilter;
      let matchesRange = true;
      if (dateRange.start && orderDate < dateRange.start) matchesRange = false;
      if (dateRange.end && orderDate > dateRange.end) matchesRange = false;
      return matchesSearch && matchesRange && matchesShipTo;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [ordersSummary, searchTerm, dateRange, shipToFilter]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const completedWOCount = useMemo(() => {
    return workOrders.filter(wo => wo.steps?.every((s: any) => s.photoUrl && s.checked)).length;
  }, [workOrders]);

  if (isLoading) return <div className="h-screen flex flex-col items-center justify-center bg-white"><div className="w-10 h-10 md:w-16 md:h-16 border-4 md:border-8 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" /></div>;

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans select-none overflow-hidden text-slate-900 text-sm md:text-lg lg:text-xl">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

      {/* 刪除確認 Modal - 放大 */}
      {woToDelete && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-xs md:max-w-md rounded-[24px] md:rounded-[32px] p-6 md:p-10 shadow-2xl animate-in zoom-in-95">
            <div className="bg-red-50 w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl flex items-center justify-center text-red-500 mb-4 md:mb-6"><Trash2 className="w-5 h-5 md:w-8 md:h-8" /></div>
            <h3 className="text-lg md:text-2xl font-black mb-2">確認刪除？</h3>
            <p className="text-slate-500 text-[11px] md:text-base mb-6 md:mb-8 leading-relaxed">{workOrders.length === 1 ? `此訂單僅剩最後一個項目，刪除將移除整個 ${currentPoId}。` : `您即將刪除 ${woToDelete.id}。此動作無法復原。`}</p>
            <div className="flex gap-2 md:gap-4">
              <button onClick={() => setWoToDelete(null)} className="flex-1 py-2 md:py-4 font-bold text-slate-400 text-xs md:text-lg rounded-xl md:rounded-2xl hover:bg-slate-50">取消</button>
              <button onClick={confirmDeleteWO} className="flex-1 py-2 md:py-4 bg-red-500 text-white rounded-xl md:rounded-2xl font-bold active:scale-95 text-xs md:text-lg shadow-lg shadow-red-100">確認刪除</button>
            </div>
          </div>
        </div>
      )}

      {/* 燈箱 - 保持全螢幕 */}
      {previewImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-in fade-in duration-300 backdrop-blur-sm">
          <header className="flex justify-between items-center p-4 md:p-6 text-white bg-black/40">
            <div className="flex items-center gap-3"><div className="bg-blue-600 p-1 md:p-2 rounded-lg"><ImageIcon className="w-4 h-4 md:w-6 md:h-6" /></div><span className="font-bold text-sm md:text-xl">檢驗照片預覽</span></div>
            <button onClick={() => setPreviewImage(null)} className="p-2 md:p-3 active:scale-90 transition-all bg-white/10 rounded-full hover:bg-white/20"><X className="w-6 h-6 md:w-8 md:h-8" /></button>
          </header>
          <div className="flex-1 flex items-center justify-center p-4"><img src={previewImage} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" alt="Preview" /></div>
        </div>
      )}

      {/* 新增 PO Modal - 放大 */}
      {showAddModal && (
        <div className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm md:max-w-xl rounded-[32px] p-6 md:p-12 shadow-2xl animate-in zoom-in-95 relative overflow-hidden">
            <div className="bg-blue-50 w-10 h-10 md:w-20 md:h-20 rounded-xl md:rounded-3xl flex items-center justify-center text-blue-600 mb-4 md:mb-8">{isCreating ? <Loader2 className="animate-spin w-6 h-6 md:w-10 md:h-10" /> : <Plus className="w-6 h-6 md:w-10 md:h-10" />}</div>
            <h3 className="text-xl md:text-4xl font-black mb-2">建立新 PO</h3>
            <p className="text-slate-400 text-[11px] md:text-lg mb-6 md:mb-10 font-medium">請輸入訂單編號以啟動檢驗流</p>
            <div className="space-y-3 md:space-y-6 mb-6 md:mb-10">
              <div className="space-y-1 md:space-y-2">
                <label className="text-[10px] md:text-sm font-black text-slate-400 uppercase tracking-widest px-1">出貨地 (ShipTo)</label>
                <select disabled={isCreating} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl md:rounded-2xl py-2 md:py-4 px-3 md:px-5 font-bold outline-none text-sm md:text-xl appearance-none" value={newShipToInput} onChange={(e) => setNewShipToInput(e.target.value)}>
                  {SHIP_TO_LIST.map(ship => <option key={ship} value={ship}>{ship}</option>)}
                </select>
              </div>
              <div className="space-y-1 md:space-y-2">
                <label className="text-[10px] md:text-sm font-black text-slate-400 uppercase px-1">訂單編號</label>
                <div className="relative"><Hash className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5 md:w-6 md:h-6" /><input autoFocus disabled={isCreating} type="text" placeholder="PO-XXXXX" className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-xl md:rounded-2xl py-2 md:py-4 pl-9 md:pl-16 pr-3 md:pr-6 font-black text-lg md:text-3xl outline-none uppercase transition-all shadow-inner" value={newPoInput} onChange={(e) => setNewPoInput(e.target.value)} /></div>
              </div>
            </div>
            <div className="flex gap-2 md:gap-4">
              {!isCreating && <button onClick={() => setShowAddModal(false)} className="flex-1 py-2 md:py-5 font-bold text-slate-400 text-xs md:text-xl rounded-xl md:rounded-2xl hover:bg-slate-50">取消</button>}
              <button onClick={handleCreateOrder} disabled={!newPoInput || isCreating} className={`flex-[2] py-3 md:py-5 rounded-xl md:rounded-2xl font-bold active:scale-95 transition-all text-xs md:text-xl shadow-xl ${isCreating ? 'bg-blue-50 text-blue-400' : 'bg-blue-600 text-white shadow-blue-200'}`}>{isCreating ? '建立中...' : '確認建立'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Header - 放大 Padding 與文字 */}
      <header className="bg-white border-b px-4 md:px-8 py-2 md:py-4 flex justify-between items-center shadow-sm z-40 relative">
        <div className="flex items-center gap-2 md:gap-4">
          {viewMode !== 'home' && (
            <button onClick={() => setViewMode('home')} className="p-1.5 md:p-3 bg-slate-50 rounded-lg md:rounded-2xl text-slate-600 active:scale-90 transition-all hover:text-blue-600"><ArrowLeft className="w-4.5 h-4.5 md:w-8 md:h-8" /></button>
          )}
          <div className="flex items-center gap-2 md:gap-4">
            <div className="bg-slate-900 p-1.5 md:p-3 rounded-lg md:rounded-2xl text-white shadow-sm"><PackageCheck className="w-4 h-4 md:w-8 md:h-8" /></div>
            <div><h1 className="font-black text-xs md:text-2xl text-slate-800 leading-none truncate max-w-[100px] md:max-w-xs">{viewMode === 'home' ? '終檢中心' : currentPoId}</h1></div>
          </div>
        </div>
        <div className={`px-2 md:px-4 py-1 md:py-2 rounded-full text-[8px] md:text-xs font-black uppercase ${isOnline ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{isOnline ? 'Online' : 'Offline'}</div>
      </header>

      <div className="flex-1 overflow-hidden flex max-w-7xl mx-auto w-full bg-white shadow-2xl">
        {viewMode !== 'home' && (
          // Sidebar - 寬度放大，按鈕放大
          <aside className="hidden md:flex w-56 md:w-80 bg-white border-r border-slate-100 flex-col z-20 overflow-hidden shadow-sm">
            <div className="p-4 md:p-6 bg-slate-50/50 border-b"><h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-[0.2em]">工單清單</h3></div>
            <nav className="flex-1 overflow-y-auto p-2 md:p-4 space-y-1.5 md:space-y-3 custom-scrollbar">
              {workOrders.map((wo, idx) => {
                const isActive = activeWoIndex === idx;
                const doneSteps = wo.steps?.filter((s: any) => s.photoUrl && s.checked).length || 0;
                return (
                  <div key={wo.wo_id || idx} className="relative group/wo">
                    <button onClick={() => { setActiveWoIndex(idx); setActiveStepIndex(0); }} className={`w-full p-3 md:p-5 pr-8 md:pr-12 rounded-xl md:rounded-[24px] text-left transition-all ${isActive ? 'bg-blue-600 text-white shadow-md md:shadow-xl shadow-blue-100' : 'hover:bg-slate-50 border border-transparent'}`}>
                      <p className="font-black text-xs md:text-xl leading-tight mb-1 md:mb-2">{wo.wo_id}</p>
                      <div className="flex items-center gap-1.5 md:gap-3"><div className={`w-12 md:w-24 h-1 md:h-1.5 rounded-full overflow-hidden ${isActive ? 'bg-blue-400' : 'bg-slate-100'}`}><div className={`h-full ${isActive ? 'bg-white' : 'bg-blue-500'}`} style={{ width: `${(doneSteps / 4) * 100}%` }} /></div><span className={`text-[8px] md:text-xs font-black ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>{doneSteps}/4</span></div>
                    </button>
                    {!isSubmitted && <button onClick={(e) => { e.stopPropagation(); setWoToDelete({ index: idx, id: wo.wo_id }); }} className={`absolute right-1 md:right-4 top-1/2 -translate-y-1/2 p-1.5 md:p-3 rounded-lg md:rounded-xl transition-all ${isActive ? 'text-white/40 hover:text-white hover:bg-white/10' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'}`}><Trash2 className="w-3 h-3 md:w-5 md:h-5" /></button>}
                  </div>
                );
              })}
              {!isSubmitted && <button onClick={() => { const newOrders = [...workOrders, { wo_id: `WO-0${workOrders.length + 1}`, customer_id: "", prod_date: getTodayDate(), inspect_date: getTodayDate(), size: "", prod_qty: "", color: "", inspect_qty: "", failed_qty: "0", result: "合格", steps: STEPS_PER_WO.map(s => ({ ...s, checked: false, photoUrl: null, remarks: "" })) }]; setWorkOrders(newOrders); syncToCloud(newOrders); setActiveWoIndex(workOrders.length); setActiveStepIndex(0); }} className="w-full py-2 md:py-4 border-2 border-dashed border-slate-200 rounded-xl md:rounded-[20px] text-slate-400 font-bold text-[9px] md:text-sm flex items-center justify-center gap-1.5 md:gap-2 hover:bg-blue-50 hover:text-blue-500 transition-all">+ 新增工單</button>}
            </nav>
          </aside>
        )}

        <main className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
          {viewMode === 'home' ? (
            <div className="flex-1 overflow-y-auto p-4 md:p-12 space-y-5 md:space-y-10 animate-in fade-in duration-500 pb-32">
              <div className="max-w-5xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 mb-6 md:mb-10">
                  <div><h2 className="text-2xl md:text-5xl font-black text-slate-900 tracking-tighter mb-0.5 md:mb-2">檢驗進度看板</h2><p className="text-slate-400 font-bold uppercase text-[8px] md:text-sm tracking-widest px-1">Last sync: {new Date().toLocaleTimeString()}</p></div>
                  <button onClick={() => setShowAddModal(true)} className="bg-blue-600 text-white px-4 md:px-8 py-2.5 md:py-5 rounded-xl md:rounded-[28px] font-black text-[11px] md:text-xl flex items-center gap-2 md:gap-3 shadow-lg hover:bg-blue-700 active:scale-95 transition-all w-full md:w-auto justify-center"><Plus className="w-4 h-4 md:w-6 md:h-6" /> 啟動新 PO</button>
                </div>

                {/* 搜尋列 - 放大 */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 md:gap-4 mb-6 md:mb-10">
                  <div className="lg:col-span-1 relative"><Search className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5 md:w-6 md:h-6" /><input type="text" placeholder="搜尋 PO..." className="w-full bg-white border-none rounded-xl md:rounded-[24px] py-2.5 md:py-5 pl-9 md:pl-16 shadow-sm font-bold text-xs md:text-lg outline-none focus:ring-4 focus:ring-blue-100" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                  <div className="lg:col-span-1 relative"><MapPin className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5 md:w-6 md:h-6" /><select className="w-full bg-white border-none rounded-xl md:rounded-[24px] py-2.5 md:py-5 pl-9 md:pl-16 pr-6 shadow-sm font-bold text-xs md:text-lg outline-none appearance-none cursor-pointer" value={shipToFilter} onChange={(e) => setShipToFilter(e.target.value)}><option value="">所有出貨地</option>{SHIP_TO_LIST.map(ship => <option key={ship} value={ship}>{ship}</option>)}</select><ChevronRight className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 rotate-90 text-slate-300 w-3 h-3 md:w-5 md:h-5" /></div>
                  <div className="lg:col-span-2 bg-white rounded-xl md:rounded-[24px] p-1 md:p-2 flex items-center gap-1 md:gap-2 shadow-sm">
                    <div className="flex-1 flex items-center gap-1.5 md:gap-3 px-2 md:px-5 py-1.5 md:py-3 bg-slate-50 rounded-lg md:rounded-2xl w-full"><Calendar className="w-3 h-3 md:w-5 md:h-5 text-blue-500" /><input type="date" className="bg-transparent border-none outline-none font-bold text-[10px] md:text-base flex-1" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} /><span className="text-slate-300 font-bold text-[8px] md:text-xs">起</span></div>
                    <div className="flex-1 flex items-center gap-1.5 md:gap-3 px-2 md:px-5 py-1.5 md:py-3 bg-slate-50 rounded-lg md:rounded-2xl w-full"><Calendar className="w-3 h-3 md:w-5 md:h-5 text-blue-500" /><input type="date" className="bg-transparent border-none outline-none font-bold text-[10px] md:text-base flex-1" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} /><span className="text-slate-300 font-bold text-[8px] md:text-xs">止</span></div>
                    {(dateRange.start || dateRange.end || shipToFilter) && <button onClick={() => { setDateRange({ start: "", end: "" }); setShipToFilter(""); }} className="p-1.5 md:p-3 bg-red-50 text-red-500 rounded-lg md:rounded-xl hover:bg-red-100"><X className="w-3 h-3 md:w-5 md:h-5" /></button>}
                  </div>
                </div>

                <div className="flex flex-col gap-3 md:gap-4">
                  {filteredOrdersSummary.length > 0 ? filteredOrdersSummary.map(order => {
                    const totalWOs = order.workOrders?.length || 0;
                    const doneWOs = order.workOrders?.filter((wo: any) => wo.steps?.every((s: any) => s.photoUrl && s.checked)).length || 0;
                    const progress = totalWOs > 0 ? Math.round((doneWOs / totalWOs) * 100) : 0;
                    return (
                      <button key={order.id} onClick={() => { setCurrentPoId(order.id); setViewMode('edit'); setActiveWoIndex(0); setActiveStepIndex(0); }}
                        className="w-full bg-white p-3 md:p-6 rounded-xl md:rounded-[24px] shadow-sm border border-slate-100 flex items-center gap-3 md:gap-6 hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-[0.99] group text-left">

                        {/* Status Indicator */}
                        <div className={`w-1 md:w-1.5 self-stretch rounded-full ${order.status === 'SUBMITTED' ? 'bg-green-500' : 'bg-blue-500'}`} />

                        <div className="flex-1 min-w-0 grid grid-cols-12 gap-2 md:gap-6 items-center">
                          {/* PO Number */}
                          <div className="col-span-4 md:col-span-3">
                            <span className="block text-[8px] md:text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5 md:mb-1">PO 單號</span>
                            <span className="block font-black text-sm md:text-2xl text-slate-800 truncate">{order.id}</span>
                          </div>

                          {/* Ship To */}
                          <div className="col-span-3 md:col-span-3 border-l border-slate-100 pl-2 md:pl-6">
                            <span className="block text-[8px] md:text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5 md:mb-1">出貨地</span>
                            <span className="block font-bold text-xs md:text-lg text-slate-600 truncate">{order.shipTo || "-"}</span>
                          </div>

                          {/* Progress */}
                          <div className="col-span-5 md:col-span-6 border-l border-slate-100 pl-2 md:pl-6 flex flex-col justify-center">
                            <div className="flex justify-between items-end mb-1 md:mb-2">
                              <span className="text-[8px] md:text-xs text-slate-400 font-bold uppercase tracking-wider">進度</span>
                              <div className="flex items-baseline gap-1">
                                <span className={`font-black text-xs md:text-lg ${order.status === 'SUBMITTED' ? 'text-green-600' : 'text-blue-600'}`}>{progress}%</span>
                                <span className="text-[8px] md:text-xs text-slate-400 font-medium hidden sm:inline">({doneWOs}/{totalWOs})</span>
                              </div>
                            </div>
                            <div className="w-full h-1.5 md:h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-1000 ${order.status === 'SUBMITTED' ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                        </div>

                        <ChevronRight className="text-slate-300 w-4 h-4 md:w-6 md:h-6 shrink-0 group-hover:text-blue-500 transition-colors" />
                      </button>
                    );
                  }) : <div className="py-16 md:py-32 text-center text-slate-300 flex flex-col items-center"><Filter className="w-8 h-8 md:w-16 md:h-16 mb-2 md:mb-6 opacity-30" /><p className="text-xs md:text-2xl font-black">查無資料</p></div>}
                </div>
              </div>
            </div>
          ) : viewMode === 'edit' && activeStep ? (
            <div className="flex-1 flex flex-col overflow-hidden animate-in slide-in-from-right-10 duration-500 bg-slate-50">
              <div ref={editScrollRef} className="flex-1 overflow-y-auto p-4 md:p-12 custom-scrollbar">
                <div className="max-w-4xl mx-auto space-y-6 md:space-y-10 pb-20">
                  <div className="pt-2 px-1 flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                      <span className="bg-blue-600 text-white text-[8px] md:text-xs font-black px-2 md:px-4 py-0.5 md:py-1.5 rounded-full uppercase tracking-widest shadow mb-1.5 md:mb-3 inline-block">Phase 0{activeStepIndex + 1}</span>
                      <h2 className="text-xl md:text-5xl font-black text-slate-900 tracking-tighter leading-tight truncate max-w-full mb-1 md:mb-3">{activeStep.title}</h2>
                      <p className="text-slate-400 font-black text-[9px] md:text-base tracking-widest uppercase flex items-center gap-1.5 md:gap-3"><Navigation className="w-2.5 h-2.5 md:w-4 md:h-4 text-blue-500" /> 工單: {activeWO?.wo_id}</p>
                    </div>
                    <div className="flex gap-1.5 md:gap-3 items-center bg-white px-3 md:px-6 py-1.5 md:py-4 rounded-full shadow-sm border border-slate-100 self-start md:self-auto">
                      <span className="text-[10px] md:hidden font-black text-slate-400 mr-1">進度 {activeStepIndex + 1}/4</span>
                      {[0, 1, 2, 3].map(i => <div key={i} className={`h-1.5 md:h-3 rounded-full transition-all duration-700 ${i === activeStepIndex ? 'bg-blue-600 w-6 md:w-12 shadow' : (activeWO?.steps?.[i]?.checked ? 'bg-green-500 w-1.5 md:w-3' : 'bg-slate-200 w-1.5 md:w-3')}`} />)}
                    </div>
                  </div>

                  <section className="bg-white rounded-[24px] md:rounded-[56px] p-5 md:p-14 shadow-sm border border-white relative overflow-hidden">
                    <div className="flex items-center justify-between mb-5 md:mb-12 border-b border-slate-50 pb-3 md:pb-8"><div className="flex items-center gap-2 md:gap-4"><FileText className="w-4 h-4 md:w-8 md:h-8 text-blue-600" /><h3 className="font-black text-sm md:text-3xl text-slate-800">工單資訊</h3></div>{!isSubmitted && <button onClick={() => setWoToDelete({ index: activeWoIndex, id: activeWO?.wo_id })} className="p-2 bg-red-50 text-red-500 rounded-lg active:scale-90 md:hidden"><Trash2 size={14} /></button>}</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-10">
                      {[
                        { label: "客戶編號", value: activeWO?.customer_id, key: "customer_id", type: "text" },
                        { label: "生產日期", value: activeWO?.prod_date?.replace(/\//g, '-'), key: "prod_date", type: "date" },
                        { label: "檢驗日期", value: activeWO?.inspect_date?.replace(/\//g, '-'), key: "inspect_date", type: "date" },
                        { label: "尺寸", value: activeWO?.size, key: "size", type: "text" },
                        { label: "產品顏色", value: activeWO?.color, key: "color", type: "text" },
                        { label: "生產數量", value: activeWO?.prod_qty, key: "prod_qty", type: "number" },
                        { label: "檢驗數量", value: activeWO?.inspect_qty, key: "inspect_qty", type: "number" },
                        { label: "不合格數", value: activeWO?.failed_qty, key: "failed_qty", type: "number", color: "text-red-600" }
                      ].map(field => (
                        <div key={field.key} className="space-y-1 md:space-y-3">
                          <label className="text-[9px] md:text-sm font-black text-slate-400 uppercase px-1">{field.label}</label>
                          <input disabled={isSubmitted} type={field.type} value={field.value || ""} onChange={(e) => updateActiveWOField(field.key, e.target.value)} className={`w-full bg-slate-50 border border-transparent focus:border-blue-500 rounded-lg md:rounded-[24px] p-2 md:p-5 text-xs md:text-xl font-black transition-all outline-none ${field.color || ""}`} />
                        </div>
                      ))}
                      <div className="space-y-1 md:space-y-3">
                        <label className="text-[9px] md:text-sm font-black text-slate-400 uppercase px-1">判定結果</label>
                        <select disabled={isSubmitted} value={activeWO?.result || "合格"} onChange={(e) => updateActiveWOField('result', e.target.value)} className="w-full bg-slate-50 border border-transparent focus:border-blue-500 rounded-lg md:rounded-[24px] p-2 md:p-5 text-xs md:text-xl font-black outline-none appearance-none cursor-pointer"><option value="合格">合格</option><option value="不合格">不合格</option><option value="待處理">待處理</option></select>
                      </div>
                    </div>
                  </section>

                  <section className="bg-white rounded-[24px] md:rounded-[56px] p-5 md:p-14 shadow-sm border border-white space-y-6 md:space-y-12">
                    <div className="p-4 md:p-8 bg-blue-50/50 rounded-xl md:rounded-[40px] border border-blue-100 border-l-4 md:border-l-[12px] border-l-blue-600"><p className="text-xs md:text-2xl text-blue-900 font-bold leading-relaxed">{activeStep.description}</p></div>
                    <div className="flex flex-col items-center justify-center p-6 md:p-16 border-2 md:border-4 border-dashed border-slate-100 rounded-2xl md:rounded-[64px] bg-slate-50/30">
                      {activeStep.isUploading ? (
                        <div className="flex flex-col items-center"><Loader2 className="animate-spin w-8 h-8 md:w-20 md:h-20 text-blue-600 mb-2 md:mb-6" /><p className="text-blue-600 font-black uppercase text-[8px] md:text-sm">同步中</p></div>
                      ) : activeStep.photoUrl ? (
                        <div className="flex flex-col items-center gap-4 md:gap-8">
                          <div className="relative group/thumb"><img onClick={() => setPreviewImage(activeStep.photoUrl)} src={activeStep.photoUrl} className="w-40 h-40 md:w-80 md:h-80 object-cover rounded-xl md:rounded-[32px] shadow border-2 md:border-4 border-white cursor-pointer" alt="Preview" /><div className="absolute top-2 right-2 md:top-4 md:right-4 bg-white/90 p-1.5 md:p-3 rounded-lg md:rounded-2xl shadow-sm"><Eye className="w-3.5 h-3.5 md:w-8 md:h-8 text-blue-600" /></div></div>
                          {!isSubmitted && <button onClick={() => fileInputRef.current?.click()} className="text-blue-600 text-[10px] md:text-lg font-black underline">更換照片</button>}
                        </div>
                      ) : (
                        <button disabled={isSubmitted} onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-3 md:gap-8 active:scale-90 transition-all"><div className="w-16 h-16 md:w-36 md:h-36 bg-white shadow rounded-full flex items-center justify-center text-blue-600"><UploadCloud className="w-7 h-7 md:w-16 md:h-16" /></div><span className="font-black text-xs md:text-3xl text-slate-800">上傳檢驗照</span></button>
                      )}
                    </div>
                    <div className="space-y-4 md:space-y-10 pt-4 md:pt-12 border-t border-slate-50">
                      <div className="space-y-1 md:space-y-4"><label className="text-[9px] md:text-xs font-black text-slate-400 px-1 uppercase tracking-widest flex items-center gap-2"><MessageSquareText className="w-3 h-3 md:w-5 md:h-5 text-blue-500" /> 備註說明</label><textarea disabled={isSubmitted} placeholder="異常紀錄..." className="w-full bg-slate-50 rounded-xl md:rounded-[48px] p-4 md:p-10 text-xs md:text-lg font-bold min-h-[80px] md:min-h-[180px] outline-none shadow-inner resize-none transition-all focus:bg-white" value={activeStep.remarks} onChange={(e) => updateActiveStep({ remarks: e.target.value })} /></div>
                      <button disabled={!activeStep.photoUrl || isSubmitted} onClick={() => updateActiveStep({ checked: !activeStep.checked })} className={`w-full py-3 md:py-10 rounded-xl md:rounded-[48px] font-black text-base md:text-4xl flex items-center justify-center gap-2 md:gap-6 transition-all shadow-md md:shadow-2xl ${activeStep.checked ? 'bg-green-600 text-white shadow-green-100' : 'bg-white text-slate-300 border border-slate-100'}`}>{activeStep.checked ? <CheckCircle2 className="w-5 h-5 md:w-12 md:h-12" /> : <div className="w-4 h-4 md:w-10 md:h-10 rounded-full border-2 md:border-4 border-slate-100" />} {activeStep.checked ? '已確認合格' : '點擊確認本項結果'}</button>
                    </div>
                  </section>
                </div>
              </div>

              {/* Footer - 放大 */}
              <footer className="bg-white/95 backdrop-blur-xl border-t p-3 md:p-8 flex gap-3 md:gap-8 z-40 sticky bottom-0 shadow-[0_-8px_30px_rgba(0,0,0,0.04)]">
                <div className="max-w-4xl mx-auto w-full flex gap-3 md:gap-6">
                  <button onClick={() => activeStepIndex > 0 ? setActiveStepIndex(prev => prev - 1) : setViewMode('home')} className="px-5 md:px-12 py-2.5 md:py-6 flex items-center gap-2 md:gap-5 font-black text-slate-400 hover:text-slate-900 active:scale-90 transition-all text-xs md:text-xl border border-transparent rounded-xl md:rounded-[32px]">
                    {activeStepIndex === 0 ? <RotateCcw className="w-4 h-4 md:w-8 md:h-8" /> : <ChevronLeft className="w-4 h-4 md:w-8 md:h-8" />}
                    <span className="inline">{activeStepIndex === 0 ? '退出' : '上一步'}</span>
                  </button>
                  {activeStepIndex < 3 ? (
                    <button onClick={() => setActiveStepIndex(prev => prev + 1)} disabled={!activeStep.photoUrl || !activeStep.checked} className="flex-1 py-2.5 md:py-6 bg-blue-600 text-white rounded-xl md:rounded-[32px] font-black text-sm md:text-3xl shadow-lg shadow-blue-100 active:scale-[0.98] transition-all disabled:bg-slate-200 disabled:shadow-none">下一檢驗關卡</button>
                  ) : (
                    <button onClick={() => { if (workOrders.every((wo: any) => wo.steps?.every((s: any) => s.photoUrl && s.checked))) syncToCloud(workOrders, 'SUBMITTED'); setViewMode('home'); }} disabled={!activeStep.photoUrl || !activeStep.checked} className={`flex-1 py-2.5 md:py-6 rounded-xl md:rounded-[32px] font-black text-sm md:text-3xl shadow-lg transition-all active:scale-[0.98] ${isSubmitted ? 'bg-slate-800 text-white' : 'bg-orange-500 text-white shadow-orange-100'}`}>{isSubmitted ? '檢視完成' : '完成存檔回清單'}</button>
                  )}
                </div>
              </footer>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}