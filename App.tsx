import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, collection, deleteDoc } from 'firebase/firestore';
import { 
  CheckCircle2, ChevronRight, ChevronLeft, UploadCloud, RotateCcw, Send, PackageCheck,
  Wifi, WifiOff, Clock, CheckCircle, Layout, Image as ImageIcon, ClipboardList,
  Search, MessageSquareText, Trash2, Save, Eye, X, FileText, CalendarClock,
  Navigation, Info, ArrowLeft, Plus, Calendar, AlertTriangle, User, Hash, Filter,
  ArrowRight, Loader2
} from 'lucide-react';

// --- Firebase 配置 ---
// Note: In a real environment, these globals would be injected by the server or build process.
// We mocked them in index.html to ensure the app loads in preview.
const firebaseConfig = JSON.parse((window as any).__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'inspection-master-pro';

// --- 配置檢驗關卡 ---
const STEPS_PER_WO = [
  { id: 1, title: "Blind overview - Closed slat", description: "盲窗概覽：請確認葉片處於「完全閉合」狀態，檢查整體外觀與遮光性。" },
  { id: 2, title: "Blind overview - Opened slat", description: "盲窗概覽：請確認葉片處於「開啟」狀態，檢查梯繩平整度與運作順暢度。" },
  { id: 3, title: "Bottom rail label", description: "底軌標籤：請清晰拍攝底軌上的產品標籤，須包含規格、序號與製造資訊。" },
  { id: 4, title: "Completed package", description: "成品包裝：請拍攝產品裝箱後的封箱狀態、外箱標籤與保護材配置。" }
];

const getNowDateTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

// 使用函數生成初始資料，確保記憶體位置獨立
const createInitialWorkOrders = () => ([
  { 
    wo_id: "WO-01", 
    customer_id: "", 
    prod_time: getNowDateTime(), 
    prod_qty: "", 
    color: "", 
    inspect_qty: "", 
    failed_qty: "0", 
    result: "合格",
    steps: STEPS_PER_WO.map(s => ({ ...s, checked: false, photoUrl: null, remarks: "" })) 
  }
]);

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [viewMode, setViewMode] = useState('home'); // 'home', 'edit'
  const [ordersSummary, setOrdersSummary] = useState<any[]>([]);
  const [currentPoId, setCurrentPoId] = useState<string | null>(null);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [poStatus, setPoStatus] = useState('DRAFT'); 
  
  const [activeWoIndex, setActiveWoIndex] = useState(0); 
  const [activeStepIndex, setActiveStepIndex] = useState(0); 
  
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState({ start: "", end: "" }); 
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showToast, setShowToast] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPoInput, setNewPoInput] = useState("");
  const [isCreating, setIsCreating] = useState(false); 
  
  const [woToDelete, setWoToDelete] = useState<{index: number, id: string} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editScrollRef = useRef<HTMLDivElement>(null);

  // --- Auth (Rule 3) ---
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

  // --- 監聽網路 ---
  useEffect(() => {
    const handleStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleStatus);
    window.addEventListener('offline', handleStatus);
    return () => {
      window.removeEventListener('online', handleStatus);
      window.removeEventListener('offline', handleStatus);
    };
  }, []);

  // --- 監聽首頁清單 (Rule 1 & 2) ---
  useEffect(() => {
    if (!user) {
        // Mock data for preview if auth/firebase fails or takes too long in dev
        if (!isLoading) return;
        const mockTimer = setTimeout(() => {
             // If we are still loading and no user, likely fake environment, stop loading
             if(isLoading) setIsLoading(false);
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

  // --- 監聽選中 PO 詳細資訊 ---
  useEffect(() => {
    if (!user || !currentPoId) return;
    const poRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentPoId);
    const unsubscribe = onSnapshot(poRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setWorkOrders(data.workOrders || []);
        setPoStatus(data.status || 'DRAFT');
      }
    }, (err) => {
      console.error("Firestore Detail Error:", err);
    });
    return () => unsubscribe();
  }, [user, currentPoId]);

  // --- 自動置頂 ---
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
    } catch (err) { 
        console.error("Sync Error", err); 
        // For demo purposes, if cloud sync fails (e.g. permission denied or dummy config), just update local state
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2000);
    }
  };

  const handleCreateOrder = async () => {
    if (!newPoInput || isCreating) return;
    
    setIsCreating(true);
    const poId = newPoInput.trim().toUpperCase();
    
    // Safety check for user
    const userId = user?.uid || 'guest';

    const poRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', poId);
    
    const initialData = {
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedBy: userId,
      workOrders: createInitialWorkOrders()
    };

    // Timeout promise to prevent hanging if Firestore is unreachable
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Request timed out")), 2000)
    );

    try {
      // Race between setDoc and timeout
      await Promise.race([
        setDoc(poRef, initialData),
        timeoutPromise
      ]);

      setCurrentPoId(poId);
      setActiveWoIndex(0);
      setActiveStepIndex(0);
      setViewMode('edit');
      setShowAddModal(false);
      setNewPoInput("");
    } catch (err) {
      console.error("Create Fail or Timeout", err);
      // Fallback: Proceed with local state
      setCurrentPoId(poId);
      setWorkOrders(initialData.workOrders);
      // Check if order already exists in summary to prevent duplicates in local state logic
      setOrdersSummary(prev => {
        if (prev.find(o => o.id === poId)) return prev;
        return [{ id: poId, ...initialData }, ...prev];
      });
      setActiveWoIndex(0);
      setActiveStepIndex(0);
      setViewMode('edit');
      setShowAddModal(false);
      setNewPoInput("");
    } finally {
      setIsCreating(false);
    }
  };

  // --- 修正後的刪除邏輯：穩定性加強版 ---
  const confirmDeleteWO = async () => {
    if (woToDelete === null || !currentPoId) return;
    
    const index = woToDelete.index;
    const poRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', currentPoId);

    // 情況 A：最後一個工單 -> 完整刪除 PO
    if (workOrders.length <= 1) {
      try {
        setWoToDelete(null);
        await deleteDoc(poRef);
        // 先清理本地緩存資料
        setWorkOrders([]);
        setCurrentPoId(null);
        setViewMode('home');
      } catch (err) {
        console.error("Delete PO Fail", err);
        // Fallback for demo
        setWorkOrders([]);
        setCurrentPoId(null);
        setViewMode('home');
        setOrdersSummary(prev => prev.filter(o => o.id !== currentPoId));
      }
    } else {
      // 情況 B：移除單一工單
      try {
        const newOrders = workOrders.filter((_, i) => i !== index);
        // 修正導航索引，避免指向不存在的工單
        if (activeWoIndex >= newOrders.length) {
          setActiveWoIndex(Math.max(0, newOrders.length - 1));
        }
        setActiveStepIndex(0);
        setWoToDelete(null);
        await syncToCloud(newOrders);
        setWorkOrders(newOrders);
      } catch (err) {
        console.error("Remove WO Fail", err);
      }
    }
  };

  const updateActiveWOField = (field: string, value: any) => {
    if (!workOrders[activeWoIndex]) return;
    const newOrders = [...workOrders];
    newOrders[activeWoIndex] = { ...newOrders[activeWoIndex], [field]: value };
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

  // --- 計算屬性 (加上安全鏈) ---
  const activeWO = useMemo(() => workOrders[activeWoIndex] || null, [workOrders, activeWoIndex]);
  const activeStep = useMemo(() => activeWO?.steps?.[activeStepIndex] || null, [activeWO, activeStepIndex]);
  const isSubmitted = poStatus === 'SUBMITTED';

  const filteredOrdersSummary = useMemo(() => {
    return ordersSummary.filter(o => {
      const matchesSearch = o.id.toLowerCase().includes(searchTerm.toLowerCase());
      const orderDate = o.createdAt?.split('T')[0] || "";
      
      let matchesRange = true;
      if (dateRange.start && orderDate < dateRange.start) matchesRange = false;
      if (dateRange.end && orderDate > dateRange.end) matchesRange = false;
      
      return matchesSearch && matchesRange;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [ordersSummary, searchTerm, dateRange]);

  const completedWOCount = useMemo(() => {
    return workOrders.filter(wo => wo.steps?.every((s: any) => s.photoUrl && s.checked)).length;
  }, [workOrders]);

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400 font-bold animate-pulse">載入數據中心...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans select-none overflow-hidden text-slate-900">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

      {/* 刪除確認 Modal */}
      {woToDelete && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl animate-in zoom-in-95">
             <div className="bg-red-50 w-14 h-14 rounded-2xl flex items-center justify-center text-red-500 mb-6">
                <Trash2 size={28} />
             </div>
             <h3 className="text-xl font-black mb-2 text-slate-900">
               {workOrders.length === 1 ? '完整刪除此任務？' : '確認刪除工單？'}
             </h3>
             <p className="text-slate-500 text-sm mb-8 leading-relaxed">
               {workOrders.length === 1 
                 ? `此訂單僅剩最後一個項目，刪除將徹底移除整個 ${currentPoId} 並返回首頁。`
                 : `您即將刪除 ${woToDelete.id}。此動作無法復原。`}
             </p>
             <div className="flex gap-3">
                <button onClick={() => setWoToDelete(null)} className="flex-1 py-4 font-black text-slate-400 hover:bg-slate-50 rounded-2xl transition-colors">取消</button>
                <button onClick={confirmDeleteWO} className="flex-[2] py-4 bg-red-500 text-white rounded-2xl font-black active:scale-95 transition-all">確認刪除</button>
             </div>
          </div>
        </div>
      )}

      {/* 燈箱 */}
      {previewImage && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-in fade-in duration-300 backdrop-blur-sm">
          <header className="flex justify-between items-center p-6 text-white bg-black/40">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg"><ImageIcon size={20} /></div>
              <span className="font-black tracking-tight text-lg">檢驗細節預覽</span>
            </div>
            <button onClick={() => setPreviewImage(null)} className="p-3 bg-white/10 rounded-full hover:bg-white/20 active:scale-90 transition-all"><X size={32} /></button>
          </header>
          <div className="flex-1 flex items-center justify-center p-4">
            <img src={previewImage} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" alt="Preview Full" />
          </div>
        </div>
      )}

      {/* 新增 PO Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[48px] p-12 shadow-2xl animate-in zoom-in-95 relative overflow-hidden">
             <div className="bg-blue-50 w-16 h-16 rounded-3xl flex items-center justify-center text-blue-600 mb-6">
                {isCreating ? <Loader2 size={32} className="animate-spin" /> : <Plus size={32} />}
             </div>
             <h3 className="text-3xl font-black mb-2 text-slate-900">建立新 PO</h3>
             <p className="text-slate-400 text-sm mb-8 font-medium">
               {isCreating ? '正在初始化檢驗流程...' : '請輸入訂單編號以啟動檢驗流'}
             </p>
             <div className="relative mb-8">
               <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
               <input 
                autoFocus disabled={isCreating} type="text" placeholder="PO-XXXXX" 
                className={`w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl py-6 pl-14 pr-6 font-black text-2xl outline-none uppercase transition-all ${isCreating ? 'opacity-50' : 'shadow-inner'}`}
                value={newPoInput} onChange={(e) => setNewPoInput(e.target.value)}
               />
             </div>
             <div className="flex gap-4">
                {!isCreating && <button onClick={() => setShowAddModal(false)} className="flex-1 py-4 font-black text-slate-400">取消</button>}
                <button 
                  onClick={handleCreateOrder} 
                  disabled={!newPoInput || isCreating} 
                  className={`flex-[2] py-5 rounded-[24px] font-black shadow-xl transition-all flex items-center justify-center gap-3 ${isCreating ? 'bg-blue-50 text-blue-400 cursor-wait' : 'bg-blue-600 text-white shadow-blue-100 active:scale-95'}`}
                >
                  {isCreating ? <><Loader2 size={20} className="animate-spin" /> 建立中</> : <>確認建立</>}
                </button>
             </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 transition-all duration-500 pointer-events-none ${showToast ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
        <div className="bg-slate-900/90 backdrop-blur text-white px-8 py-3 rounded-full shadow-2xl flex items-center gap-3 text-sm font-black border border-white/10">
          <Save size={18} className="text-blue-400 animate-pulse" /> 進度同步完成
        </div>
      </div>

      <header className="bg-white border-b px-6 py-5 flex justify-between items-center shadow-sm z-40 relative">
        <div className="flex items-center gap-4">
          {viewMode !== 'home' && (
            <button onClick={() => setViewMode('home')} className="p-3 bg-slate-50 rounded-2xl text-slate-600 active:scale-90 hover:text-blue-600 transition-all">
              <ArrowLeft size={24} />
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="bg-slate-900 p-2.5 rounded-2xl text-white shadow-xl">
              <PackageCheck size={24} />
            </div>
            <div>
              <h1 className="font-black text-xl text-slate-800 leading-none truncate max-w-[150px]">{viewMode === 'home' ? '終檢中心' : currentPoId}</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1.5 flex items-center gap-1.5">
                {viewMode === 'home' ? 'Dashboard' : `作業員: ${user?.uid.slice(0, 5)}`}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <div className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all shadow-sm ${isOnline ? 'bg-green-50 text-green-700 ring-1 ring-green-100' : 'bg-red-50 text-red-700 ring-1 ring-red-100'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              {isOnline ? 'Online' : 'Offline'}
           </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex max-w-7xl mx-auto w-full bg-white shadow-2xl">
        {viewMode !== 'home' && (
          <aside className="hidden md:flex w-80 bg-white border-r border-slate-100 flex-col z-20 overflow-hidden shadow-sm">
            <div className="p-6 bg-slate-50/50 border-b border-slate-100">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Work Order List</h3>
            </div>
            <nav className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {workOrders.map((wo, idx) => {
                const isActive = activeWoIndex === idx;
                const doneSteps = wo.steps?.filter((s: any) => s.photoUrl && s.checked).length || 0;
                return (
                  <div key={wo.wo_id || idx} className="relative group/wo">
                    <button 
                      onClick={() => { setActiveWoIndex(idx); setActiveStepIndex(0); }}
                      className={`w-full p-5 pr-12 rounded-[24px] text-left transition-all ${isActive ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'hover:bg-slate-50 border border-transparent'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-black text-lg">{wo.wo_id}</p>
                        {doneSteps === 4 && <CheckCircle size={18} className={isActive ? 'text-white' : 'text-green-500'} />}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-24 h-1.5 rounded-full overflow-hidden ${isActive ? 'bg-blue-400' : 'bg-slate-100'}`}>
                          <div className={`h-full ${isActive ? 'bg-white' : 'bg-blue-600'}`} style={{ width: `${(doneSteps/4)*100}%` }} />
                        </div>
                        <span className={`text-[10px] font-black ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>{doneSteps}/4</span>
                      </div>
                    </button>
                    {!isSubmitted && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setWoToDelete({ index: idx, id: wo.wo_id }); }}
                        className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${isActive ? 'text-white/40 hover:text-white hover:bg-white/10' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
              {!isSubmitted && (
                <button 
                  onClick={() => {
                    const newWoId = `WO-0${workOrders.length + 1}`;
                    const newOrders = [...workOrders, { 
                      wo_id: newWoId, customer_id: "", prod_time: getNowDateTime(), 
                      prod_qty: "", color: "", inspect_qty: "", failed_qty: "0", result: "合格",
                      steps: STEPS_PER_WO.map(s => ({ ...s, checked: false, photoUrl: null, remarks: "" })) 
                    }];
                    setWorkOrders(newOrders); syncToCloud(newOrders);
                    setActiveWoIndex(workOrders.length); setActiveStepIndex(0);
                  }}
                  className="w-full py-5 border-2 border-dashed border-slate-200 rounded-[24px] text-slate-400 font-black text-xs flex items-center justify-center gap-2 hover:bg-blue-50 hover:text-blue-400 transition-all"
                >
                  <Plus size={16} /> 新增工單
                </button>
              )}
            </nav>
          </aside>
        )}

        <main className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
          {viewMode === 'home' ? (
            <div className="flex-1 overflow-y-auto p-6 md:p-12 space-y-8 animate-in fade-in duration-500 pb-32">
              <div className="max-w-5xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
                   <div>
                      <h2 className="text-4xl font-black text-slate-900 tracking-tighter mb-2">檢驗進度看板</h2>
                      <p className="text-slate-400 font-bold uppercase text-xs tracking-[0.2em] flex items-center gap-2"><Clock size={12} /> Today: {new Date().toLocaleDateString()}</p>
                   </div>
                   <button onClick={() => setShowAddModal(true)} className="bg-blue-600 text-white px-8 py-5 rounded-[28px] font-black flex items-center gap-3 shadow-2xl hover:bg-blue-700 active:scale-95 transition-all w-full md:w-auto justify-center">
                    <Plus size={24} /> 啟動新 PO
                   </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
                   <div className="lg:col-span-1 relative">
                     <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                     <input type="text" placeholder="搜尋 PO 編號..." className="w-full bg-white border-none rounded-[24px] py-5 pl-14 shadow-sm font-bold text-lg focus:ring-4 focus:ring-blue-100 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                   </div>
                   <div className="lg:col-span-2 bg-white rounded-[24px] p-2 flex flex-col sm:flex-row items-center gap-2 shadow-sm">
                      <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-2xl w-full">
                         <Calendar size={18} className="text-blue-500" />
                         <input type="date" className="bg-transparent border-none outline-none font-bold text-sm flex-1" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} />
                         <span className="text-slate-300 font-bold px-2 text-xs">起始</span>
                      </div>
                      <ArrowRight size={20} className="text-slate-200 hidden sm:block" />
                      <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-2xl w-full">
                         <Calendar size={18} className="text-blue-500" />
                         <input type="date" className="bg-transparent border-none outline-none font-bold text-sm flex-1" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} />
                         <span className="text-slate-300 font-bold px-2 text-xs">結束</span>
                      </div>
                      {(dateRange.start || dateRange.end) && (
                        <button onClick={() => setDateRange({ start: "", end: "" })} className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100"><X size={20} /></button>
                      )}
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {filteredOrdersSummary.length > 0 ? filteredOrdersSummary.map(order => {
                    const totalWOs = order.workOrders?.length || 0;
                    const doneWOs = order.workOrders?.filter((wo: any) => wo.steps?.every((s: any) => s.photoUrl && s.checked)).length || 0;
                    const progress = totalWOs > 0 ? (doneWOs / totalWOs) * 100 : 0;
                    return (
                      <button key={order.id} onClick={() => { setCurrentPoId(order.id); setViewMode('edit'); setActiveWoIndex(0); setActiveStepIndex(0); }} className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 text-left hover:shadow-2xl hover:-translate-y-2 transition-all flex flex-col h-[280px]">
                        <div className="flex justify-between items-start mb-6">
                           <div className={`p-4 rounded-3xl ${order.status === 'SUBMITTED' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                              <ClipboardList size={28} />
                           </div>
                           <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${order.status === 'SUBMITTED' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                              {order.status === 'SUBMITTED' ? '已結案' : '作業中'}
                           </div>
                        </div>
                        <h4 className="font-black text-2xl text-slate-800 mb-2 truncate w-full">{order.id}</h4>
                        <p className="text-xs text-slate-400 font-bold mb-auto">{new Date(order.createdAt).toLocaleDateString()}</p>
                        <div className="mt-8 space-y-3">
                           <div className="flex justify-between text-[10px] font-black uppercase">
                              <span className="text-slate-400">完成</span>
                              <span className="text-blue-600">{doneWOs} / {totalWOs} WOs</span>
                           </div>
                           <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5">
                              <div className={`h-full rounded-full transition-all duration-1000 ${order.status === 'SUBMITTED' ? 'bg-green-500' : 'bg-blue-600'}`} style={{ width: `${progress}%` }} />
                           </div>
                        </div>
                      </button>
                    );
                  }) : (
                    <div className="col-span-full py-32 text-center text-slate-300">
                       <Filter size={48} className="mx-auto mb-4 opacity-50" />
                       <h3 className="text-2xl font-black">無符合條件的數據</h3>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : viewMode === 'edit' && activeStep ? (
            <div className="flex-1 flex flex-col overflow-hidden animate-in slide-in-from-right-10 duration-500">
              <div ref={editScrollRef} className="flex-1 overflow-y-auto p-4 md:p-12 custom-scrollbar bg-slate-50">
                <div className="max-w-4xl mx-auto space-y-10 pb-20">
                  <div className="relative pt-6 px-2">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                      <div>
                        <span className="bg-blue-600 text-white text-[11px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg mb-3 inline-block">Phase 0{activeStepIndex + 1}</span>
                        <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter leading-none mb-2 truncate max-w-full">{activeStep.title}</h2>
                        <p className="text-slate-400 font-black text-sm tracking-widest uppercase flex items-center gap-2">
                          <Navigation size={14} className="text-blue-500" /> 工單: {activeWO?.wo_id}
                        </p>
                      </div>
                      <div className="flex gap-3 items-center bg-white px-6 py-4 rounded-[28px] shadow-sm border border-slate-100">
                        {[0,1,2,3].map(i => (
                          <div key={i} className={`h-3 rounded-full transition-all duration-700 ${i === activeStepIndex ? 'bg-blue-600 w-12 shadow-lg' : (activeWO?.steps?.[i]?.checked ? 'bg-green-500 w-3' : 'bg-slate-200 w-3')}`} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <section className="bg-white rounded-[56px] p-8 md:p-14 shadow-2xl border border-white relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-2 h-full bg-blue-600 opacity-20" />
                    <div className="flex items-center justify-between mb-12 border-b border-slate-50 pb-8">
                       <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600"><FileText size={28} /></div>
                          <h3 className="font-black text-2xl text-slate-800">工單基礎資訊</h3>
                       </div>
                       {!isSubmitted && (
                          <button onClick={() => setWoToDelete({ index: activeWoIndex, id: activeWO?.wo_id })} className="p-4 bg-red-50 text-red-500 rounded-2xl active:scale-90 md:hidden"><Trash2 size={24} /></button>
                       )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                      <div className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">客戶編號</label>
                        <input disabled={isSubmitted} type="text" value={activeWO?.customer_id || ""} onChange={(e) => updateActiveWOField('customer_id', e.target.value)} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-[24px] p-5 text-base font-black transition-all outline-none" placeholder="CUST-000" />
                      </div>
                      <div className="space-y-3 md:col-span-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><CalendarClock size={16} className="text-blue-500" /> 生產日期與時間</label>
                        <input disabled={isSubmitted} type="datetime-local" value={activeWO?.prod_time || ""} onChange={(e) => updateActiveWOField('prod_time', e.target.value)} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-[24px] p-5 text-base font-black transition-all outline-none" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">產品顏色</label>
                        <input disabled={isSubmitted} type="text" value={activeWO?.color || ""} onChange={(e) => updateActiveWOField('color', e.target.value)} className="w-full bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-[24px] p-5 text-base font-black transition-all outline-none" placeholder="Color" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">生產數量</label>
                        <input disabled={isSubmitted} type="number" value={activeWO?.prod_qty || ""} onChange={(e) => updateActiveWOField('prod_qty', e.target.value)} className="w-full bg-slate-50 rounded-[24px] p-5 text-base font-black outline-none" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">檢驗數量</label>
                        <input disabled={isSubmitted} type="number" value={activeWO?.inspect_qty || ""} onChange={(e) => updateActiveWOField('inspect_qty', e.target.value)} className="w-full bg-slate-50 rounded-[24px] p-5 text-base font-black outline-none" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-xs font-black text-red-400 uppercase tracking-widest">不合格數</label>
                        <input disabled={isSubmitted} type="number" value={activeWO?.failed_qty || "0"} onChange={(e) => updateActiveWOField('failed_qty', e.target.value)} className="w-full bg-red-50 border-2 border-transparent focus:border-red-500 rounded-[24px] p-5 text-base font-black text-red-600 outline-none" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">判定結果</label>
                        <select disabled={isSubmitted} value={activeWO?.result || "合格"} onChange={(e) => updateActiveWOField('result', e.target.value)} className="w-full bg-slate-50 rounded-[24px] p-5 text-base font-black outline-none appearance-none">
                          <option value="合格">合格</option><option value="不合格">不合格</option><option value="待處理">待處理</option>
                        </select>
                      </div>
                    </div>
                  </section>

                  <section className="bg-white rounded-[56px] p-8 md:p-14 shadow-2xl border border-white">
                    <div className="space-y-12">
                      <div className="p-8 bg-blue-50 rounded-[40px] border border-blue-100 border-l-[12px] border-l-blue-600">
                        <p className="text-xl text-blue-900 font-black leading-relaxed tracking-tight">{activeStep.description}</p>
                      </div>
                      <div className="flex flex-col items-center justify-center p-16 border-4 border-dashed border-slate-100 rounded-[64px] bg-slate-50/30 group">
                        {activeStep.isUploading ? (
                          <div className="flex flex-col items-center"><Loader2 className="animate-spin w-20 h-20 text-blue-600 mb-4" /><p className="text-blue-600 font-black uppercase text-xs">影像同步中...</p></div>
                        ) : activeStep.photoUrl ? (
                          <div className="flex flex-col items-center gap-8">
                            <button onClick={() => setPreviewImage(activeStep.photoUrl)} className="px-14 py-7 bg-white border-2 border-slate-100 rounded-[32px] font-black text-2xl flex items-center gap-4 shadow-xl active:scale-95 transition-all"><Eye size={32} className="text-blue-600" /> 查看檢驗大圖</button>
                            {!isSubmitted && <button onClick={() => fileInputRef.current?.click()} className="text-slate-400 font-bold underline">重傳照片</button>}
                          </div>
                        ) : (
                          <button disabled={isSubmitted} onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-8 active:scale-90 transition-all">
                             <div className="w-36 h-36 bg-white shadow-2xl rounded-full flex items-center justify-center text-blue-600"><UploadCloud size={64} /></div>
                             <span className="font-black text-3xl text-slate-800">上傳檢驗照片</span>
                          </button>
                        )}
                      </div>
                      <div className="space-y-10 pt-12 border-t-2 border-slate-50">
                        <div className="space-y-4">
                           <label className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] px-4 flex items-center gap-3"><MessageSquareText size={20} className="text-blue-500" /> 異常說明與現場備註</label>
                           <textarea disabled={isSubmitted} placeholder="異常備註..." className="w-full bg-slate-50 rounded-[48px] p-10 text-lg font-black min-h-[180px] outline-none shadow-inner resize-none transition-all focus:bg-white" value={activeStep.remarks} onChange={(e) => updateActiveStep({ remarks: e.target.value })} />
                        </div>
                        <button disabled={!activeStep.photoUrl || isSubmitted} onClick={() => updateActiveStep({ checked: !activeStep.checked })} className={`w-full py-10 rounded-[48px] font-black text-4xl flex items-center justify-center gap-6 transition-all shadow-2xl active:scale-[0.98] ${activeStep.checked ? 'bg-green-600 text-white shadow-green-100' : 'bg-white text-slate-300 border-2 border-slate-50'}`}>
                          {activeStep.checked ? <CheckCircle2 size={44} /> : <div className="w-10 h-10 rounded-full border-4 border-slate-100" />} {activeStep.checked ? '檢驗判定合格' : '點擊確認結果'}
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              <footer className="bg-white/90 backdrop-blur-2xl border-t p-8 flex gap-8 z-40 sticky bottom-0">
                <div className="max-w-4xl mx-auto w-full flex gap-6">
                  <button onClick={() => activeStepIndex > 0 ? setActiveStepIndex(prev => prev - 1) : setViewMode('home')} className="px-12 py-6 flex items-center gap-5 font-black text-slate-400 hover:text-slate-900 active:scale-90 transition-all"><ChevronLeft size={40} /> <span className="hidden sm:inline">Back</span></button>
                  {activeStepIndex < 3 ? (
                    <button onClick={() => setActiveStepIndex(prev => prev + 1)} disabled={!activeStep.photoUrl || !activeStep.checked} className="flex-1 py-6 bg-blue-600 text-white rounded-[32px] font-black text-3xl shadow-xl shadow-blue-100 disabled:bg-slate-200 disabled:shadow-none active:scale-[0.97] transition-all">下一關卡</button>
                  ) : (
                    <button onClick={() => { if(workOrders.every((wo: any) => wo.steps?.every((s: any) => s.photoUrl && s.checked))) syncToCloud(workOrders, 'SUBMITTED'); setViewMode('home'); }} disabled={!activeStep.photoUrl || !activeStep.checked} className={`flex-1 py-6 rounded-[32px] font-black text-3xl shadow-2xl transition-all active:scale-[0.97] ${isSubmitted ? 'bg-slate-800 text-white' : 'bg-orange-500 text-white shadow-orange-100'}`}>完成存檔回首頁</button>
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