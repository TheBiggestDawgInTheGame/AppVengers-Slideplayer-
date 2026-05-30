html = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Dashboard | SlidePlay</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"/>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
  <style>
    :root{--bg:#05060d;--surface:rgba(14,18,36,0.85);--border:rgba(255,255,255,0.07);--purple:#8b5cf6;--cyan:#06b6d4;--green:#22c55e;--red:#ef4444;--yellow:#f59e0b;--text:#e2e8f0;--muted:#64748b;--sidebar:260px;}
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:"Inter",sans-serif;background:var(--bg);color:var(--text);display:flex;min-height:100vh;overflow:hidden;}

    /* overlays */
    #authOverlay{position:fixed;inset:0;background:var(--bg);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;z-index:9999;}
    .spin{width:48px;height:48px;border:4px solid rgba(139,92,246,.2);border-top-color:var(--purple);border-radius:50%;animation:spin .8s linear infinite;}
    @keyframes spin{to{transform:rotate(360deg);}}
    #authOverlay p,#accessDenied p{color:var(--muted);font-size:.9rem;}
    #accessDenied{display:none;position:fixed;inset:0;background:var(--bg);align-items:center;justify-content:center;flex-direction:column;gap:1rem;z-index:9998;}
    #accessDenied i{font-size:4rem;color:var(--red);}
    #accessDenied h2{font-family:"Orbitron",sans-serif;color:var(--red);}
    #accessDenied a{color:var(--purple);text-decoration:none;margin-top:.5rem;}

    /* sidebar */
    .sidebar{width:var(--sidebar);height:100vh;position:fixed;top:0;left:0;background:rgba(8,10,22,.97);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:1.5rem 1.25rem;z-index:100;backdrop-filter:blur(20px);}
    .logo{font-family:"Orbitron",sans-serif;font-size:1.4rem;background:linear-gradient(90deg,var(--purple),var(--cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:.25rem;}
    .logo-sub{font-size:.65rem;color:var(--muted);letter-spacing:.14em;text-transform:uppercase;margin-bottom:2rem;}
    .nav-section{font-size:.63rem;color:var(--muted);text-transform:uppercase;letter-spacing:.12em;margin:1.2rem 0 .4rem .5rem;}
    .nav a{display:flex;align-items:center;gap:.75rem;color:#94a3b8;text-decoration:none;padding:.7rem 1rem;border-radius:10px;font-size:.84rem;transition:.2s;cursor:pointer;margin-bottom:.15rem;}
    .nav a i{width:18px;text-align:center;font-size:.88rem;}
    .nav a:hover{background:rgba(139,92,246,.12);color:var(--text);}
    .nav a.active{background:rgba(139,92,246,.18);color:var(--purple);border-left:3px solid var(--purple);}
    .sidebar-footer{margin-top:auto;}
    .admin-user{display:flex;align-items:center;gap:.75rem;padding:.8rem 1rem;background:rgba(139,92,246,.08);border:1px solid rgba(139,92,246,.15);border-radius:12px;}
    .avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--purple),var(--cyan));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.9rem;flex-shrink:0;}
    .admin-user .info{flex:1;overflow:hidden;}
    .admin-user .info .name{font-size:.8rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;}
    .admin-user .info .role-lbl{font-size:.68rem;color:var(--purple);text-transform:uppercase;letter-spacing:.05em;display:block;}

    /* main */
    .main{margin-left:var(--sidebar);flex:1;height:100vh;overflow-y:auto;padding:2rem 2.5rem;}
    .topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.75rem;}
    .topbar-left h1{font-family:"Orbitron",sans-serif;font-size:1.55rem;}
    .topbar-left .breadcrumb{font-size:.76rem;color:var(--muted);margin-top:.25rem;}
    .topbar-right{display:flex;align-items:center;gap:.75rem;}
    .badge-dev{padding:.35rem 1rem;border-radius:20px;background:linear-gradient(90deg,var(--purple),var(--cyan));font-size:.7rem;font-weight:700;letter-spacing:.06em;}
    .refresh-btn{background:var(--surface);border:1px solid var(--border);color:var(--muted);padding:.4rem .9rem;border-radius:8px;cursor:pointer;font-size:.82rem;transition:.2s;}
    .refresh-btn:hover{background:rgba(139,92,246,.2);color:var(--text);}

    /* status bar */
    .status-bar{display:flex;gap:1.5rem;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:.65rem 1.25rem;margin-bottom:1.75rem;font-size:.78rem;flex-wrap:wrap;}
    .si{display:flex;align-items:center;gap:.4rem;color:#94a3b8;}
    .dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
    .dot.g{background:var(--green);box-shadow:0 0 5px var(--green);}
    .dot.y{background:var(--yellow);}
    .dot.r{background:var(--red);}

    /* stat cards */
    .cards{display:grid;grid-template-columns:repeat(6,1fr);gap:1.1rem;margin-bottom:1.75rem;}
    @media(max-width:1400px){.cards{grid-template-columns:repeat(3,1fr);}}
    @media(max-width:900px){.cards{grid-template-columns:repeat(2,1fr);}}
    .card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:1.25rem 1.35rem;position:relative;overflow:hidden;transition:.25s;backdrop-filter:blur(10px);}
    .card::after{content:'';position:absolute;top:-40px;right:-40px;width:100px;height:100px;border-radius:50%;background:var(--card-glow,rgba(139,92,246,.06));filter:blur(20px);pointer-events:none;}
    .card:hover{transform:translateY(-3px);border-color:rgba(139,92,246,.35);box-shadow:0 8px 30px rgba(139,92,246,.1);}
    .card .card-icon{font-size:1.3rem;margin-bottom:.7rem;}
    .card .card-val{font-family:"Orbitron",sans-serif;font-size:1.65rem;font-weight:700;line-height:1;}
    .card .card-label{font-size:.73rem;color:var(--muted);margin-top:.35rem;}
    /* coloured text via gradient */
    .c-purple .card-icon,.c-purple .card-val{background:linear-gradient(135deg,#8b5cf6,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
    .c-cyan   .card-icon,.c-cyan   .card-val{background:linear-gradient(135deg,#06b6d4,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
    .c-green  .card-icon,.c-green  .card-val{background:linear-gradient(135deg,#22c55e,#4ade80);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
    .c-yellow .card-icon,.c-yellow .card-val{background:linear-gradient(135deg,#f59e0b,#fbbf24);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
    .c-red    .card-icon,.c-red    .card-val{background:linear-gradient(135deg,#ef4444,#f87171);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
    .c-blue   .card-icon,.c-blue   .card-val{background:linear-gradient(135deg,#3b82f6,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}

    /* charts */
    .charts-row{display:grid;grid-template-columns:2fr 1fr;gap:1.2rem;margin-bottom:1.75rem;}
    @media(max-width:1100px){.charts-row{grid-template-columns:1fr;}}
    .panel{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:1.4rem;backdrop-filter:blur(10px);}
    .panel-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.2rem;}
    .panel-title{font-family:"Orbitron",sans-serif;font-size:.88rem;display:flex;align-items:center;gap:.5rem;}
    .panel-title i{color:var(--purple);}
    .panel-sub{font-size:.72rem;color:var(--muted);}

    /* bottom row */
    .bottom-row{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:1.2rem;margin-bottom:2rem;}
    @media(max-width:1200px){.bottom-row{grid-template-columns:1fr 1fr;}}
    @media(max-width:800px){.bottom-row{grid-template-columns:1fr;}}

    .data-row{display:flex;justify-content:space-between;align-items:center;padding:.65rem 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.82rem;gap:.5rem;}
    .data-row:last-child{border-bottom:none;}
    .dr-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#cbd5e1;}
    .dr-meta{color:var(--muted);font-size:.74rem;text-align:right;flex-shrink:0;}
    .rb{padding:.18rem .55rem;border-radius:20px;font-size:.66rem;font-weight:700;text-transform:uppercase;flex-shrink:0;letter-spacing:.04em;}
    .rb.student{background:rgba(6,182,212,.12);color:#22d3ee;}
    .rb.teacher{background:rgba(139,92,246,.12);color:#a78bfa;}
    .rb.admin{background:rgba(239,68,68,.12);color:#f87171;}
    .rb.waiting{background:rgba(234,179,8,.12);color:#fbbf24;}
    .rb.active{background:rgba(34,197,94,.12);color:#4ade80;}
    .rb.ended{background:rgba(100,116,139,.12);color:#94a3b8;}

    /* plan breakdown */
    .plan-row{display:grid;grid-template-columns:1fr auto auto;gap:.75rem;align-items:center;padding:.65rem 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.82rem;}
    .plan-row:last-child{border-bottom:none;}
    .plan-name{font-weight:500;color:#cbd5e1;}
    .plan-count{color:var(--cyan);font-family:"Orbitron",sans-serif;font-size:.78rem;text-align:right;}
    .plan-rev{color:var(--green);font-size:.76rem;text-align:right;white-space:nowrap;}
    .plan-bar-wrap{grid-column:1/-1;height:4px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;}
    .plan-bar{height:100%;background:linear-gradient(90deg,var(--purple),var(--cyan));border-radius:4px;transition:width .7s ease;}

    .empty-msg{color:var(--muted);text-align:center;padding:1.5rem 0;font-size:.82rem;}
    .main::-webkit-scrollbar{width:5px;}
    .main::-webkit-scrollbar-thumb{background:rgba(139,92,246,.25);border-radius:6px;}
  </style>
</head>
<body>

<div id="authOverlay"><div class="spin"></div><p>Verifying admin access...</p></div>
<div id="accessDenied">
  <i class="fa fa-lock"></i>
  <h2>Access Denied</h2>
  <p>This page is restricted to administrators only.</p>
  <a href="main.html"><i class="fa fa-arrow-left"></i> Back to SlidePlay</a>
</div>

<!-- SIDEBAR -->
<div class="sidebar" id="sidebar" style="display:none;">
  <div class="logo">SlidePlay</div>
  <div class="logo-sub">Admin Console</div>
  <div class="nav-section">Overview</div>
  <div class="nav"><a class="active"><i class="fa fa-gauge"></i> Dashboard</a></div>
  <div class="nav-section">Management</div>
  <div class="nav">
    <a onclick="location.href='AcessControl.html'"><i class="fa fa-users"></i> Users</a>
    <a onclick="location.href='Ana;yticsPage.html'"><i class="fa fa-chart-line"></i> Analytics</a>
    <a><i class="fa fa-credit-card"></i> Payments</a>
    <a><i class="fa fa-gamepad"></i> Game Sessions</a>
  </div>
  <div class="nav-section">System</div>
  <div class="nav">
    <a onclick="location.href='settings.html'"><i class="fa fa-cog"></i> Settings</a>
    <a onclick="firebase.auth().signOut().then(()=>location.href='login.html')"><i class="fa fa-right-from-bracket"></i> Sign Out</a>
  </div>
  <div class="sidebar-footer">
    <div class="admin-user">
      <div class="avatar" id="adminAvatar">A</div>
      <div class="info"><span class="name" id="adminName">Admin</span><span class="role-lbl">Administrator</span></div>
    </div>
  </div>
</div>

<!-- MAIN -->
<div class="main" id="mainContent" style="display:none;">

  <div class="topbar">
    <div class="topbar-left">
      <h1>Dashboard</h1>
      <div class="breadcrumb">SlidePlay Admin &rsaquo; Overview &nbsp;|&nbsp; <span id="lastRefresh">Loading...</span></div>
    </div>
    <div class="topbar-right">
      <button class="refresh-btn" onclick="loadStats()"><i class="fa fa-rotate-right"></i> Refresh</button>
      <div class="badge-dev">SYSTEM CONTROL</div>
    </div>
  </div>

  <div class="status-bar">
    <div class="si"><span class="dot g"></span> Server Online</div>
    <div class="si" id="dbStatus"><span class="dot y"></span> DB Connecting...</div>
    <div class="si"><span class="dot g"></span> Firebase Auth</div>
    <div class="si"><span class="dot g"></span> SendGrid Active</div>
    <div class="si"><span class="dot g"></span> Twilio Active</div>
  </div>

  <!-- STAT CARDS -->
  <div class="cards">
    <div class="card c-purple" style="--card-glow:rgba(139,92,246,.1)">
      <div class="card-icon"><i class="fa fa-users"></i></div>
      <div class="card-val" id="cTotal">—</div>
      <div class="card-label">Total Users</div>
    </div>
    <div class="card c-cyan" style="--card-glow:rgba(6,182,212,.1)">
      <div class="card-icon"><i class="fa fa-user-graduate"></i></div>
      <div class="card-val" id="cStudents">—</div>
      <div class="card-label">Students</div>
    </div>
    <div class="card c-blue" style="--card-glow:rgba(59,130,246,.1)">
      <div class="card-icon"><i class="fa fa-chalkboard-teacher"></i></div>
      <div class="card-val" id="cTeachers">—</div>
      <div class="card-label">Teachers</div>
    </div>
    <div class="card c-green" style="--card-glow:rgba(34,197,94,.1)">
      <div class="card-icon"><i class="fa fa-circle-check"></i></div>
      <div class="card-val" id="cSubs">—</div>
      <div class="card-label">Active Subscriptions</div>
    </div>
    <div class="card c-yellow" style="--card-glow:rgba(245,158,11,.1)">
      <div class="card-icon"><i class="fa fa-coins"></i></div>
      <div class="card-val" id="cMrr">—</div>
      <div class="card-label">Est. MRR (ZAR)</div>
    </div>
    <div class="card c-red" style="--card-glow:rgba(239,68,68,.1)">
      <div class="card-icon"><i class="fa fa-money-bill-wave"></i></div>
      <div class="card-val" id="cRevenue">—</div>
      <div class="card-label">All-time Revenue</div>
    </div>
  </div>

  <!-- CHARTS -->
  <div class="charts-row">
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title"><i class="fa fa-chart-line"></i> New Users &mdash; Last 14 Days</div>
        <div class="panel-sub" id="newUsersTotal">—</div>
      </div>
      <div style="position:relative;height:200px;"><canvas id="chartUsers"></canvas></div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title"><i class="fa fa-chart-pie"></i> User Roles</div>
      </div>
      <div style="position:relative;height:200px;"><canvas id="chartRoles"></canvas></div>
    </div>
  </div>

  <!-- BOTTOM ROW -->
  <div class="bottom-row">
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title"><i class="fa fa-user-plus"></i> Recent Signups</div>
        <div class="panel-sub">Latest 10</div>
      </div>
      <div id="recentUsersList"><div class="empty-msg">Loading...</div></div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title"><i class="fa fa-crown"></i> Plans &amp; Revenue</div>
        <div class="panel-sub">Active subscriptions</div>
      </div>
      <div id="planList"><div class="empty-msg">Loading...</div></div>
    </div>
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title"><i class="fa fa-gamepad"></i> Game Sessions</div>
        <div class="panel-sub" id="loginsToday">— logins today</div>
      </div>
      <div id="recentSessionsList"><div class="empty-msg">Loading...</div></div>
    </div>
  </div>

</div>

<script>
  firebase.initializeApp({
    apiKey:"AIzaSyA0myDAsJoOUuX4FpSZEknQ4_E0uUYNCYE",
    authDomain:"slideplay-38d3f.firebaseapp.com",
    databaseURL:"https://slideplay-38d3f-default-rtdb.firebaseio.com",
    projectId:"slideplay-38d3f",
    storageBucket:"slideplay-38d3f.firebasestorage.app",
    messagingSenderId:"902561315134",
    appId:"1:902561315134:web:3bfd74c4124acd4d1e546f"
  });
  const auth=firebase.auth(), db=firebase.database(), API='http://localhost:3000';
  let cU=null, cR=null;

  auth.onAuthStateChanged(async(user)=>{
    if(!user){showDenied();return;}
    const snap=await db.ref('users/'+user.uid+'/role').get();
    if(snap.val()!=='admin'){showDenied();return;}
    document.getElementById('authOverlay').style.display='none';
    document.getElementById('sidebar').style.display='flex';
    document.getElementById('mainContent').style.display='block';
    const name=user.displayName||user.email||'Admin';
    document.getElementById('adminName').textContent=name;
    document.getElementById('adminAvatar').textContent=name.charAt(0).toUpperCase();
    loadStats();
  });

  function showDenied(){
    document.getElementById('authOverlay').style.display='none';
    document.getElementById('accessDenied').style.display='flex';
  }

  async function loadStats(){
    try{
      const data=await(await fetch(API+'/api/admin/stats')).json();
      if(data.error)throw new Error(data.error);

      document.getElementById('dbStatus').innerHTML='<span class="dot g"></span> SQL DB Connected';
      document.getElementById('cTotal').textContent=fmt(data.counts.total);
      document.getElementById('cStudents').textContent=fmt(data.counts.students);
      document.getElementById('cTeachers').textContent=fmt(data.counts.teachers);
      document.getElementById('cSubs').textContent=fmt(data.activeSubscriptions);
      document.getElementById('cMrr').textContent='R'+fmt(data.mrr||0);
      document.getElementById('cRevenue').textContent='R'+fmt(Math.round(data.totalRevenue||0));
      document.getElementById('loginsToday').textContent=fmt(data.onlineToday)+' logins today';
      document.getElementById('lastRefresh').textContent='Updated '+new Date(data.serverTime).toLocaleTimeString();

      // users per day line chart
      const labels=(data.usersPerDay||[]).map(d=>{
        const dt=new Date(d.date+'T00:00:00');
        return dt.toLocaleDateString('en-ZA',{month:'short',day:'numeric'});
      });
      const dayData=(data.usersPerDay||[]).map(d=>d.count);
      const totalNew=dayData.reduce((a,b)=>a+b,0);
      document.getElementById('newUsersTotal').textContent=totalNew+' new users';
      if(cU)cU.destroy();
      cU=new Chart(document.getElementById('chartUsers'),{
        type:'line',
        data:{labels,datasets:[{
          label:'New Users',data:dayData,fill:true,
          borderColor:'#8b5cf6',backgroundColor:'rgba(139,92,246,0.1)',
          tension:0.4,pointBackgroundColor:'#8b5cf6',
          pointRadius:4,pointHoverRadius:7,borderWidth:2
        }]},
        options:{responsive:true,maintainAspectRatio:false,
          plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(14,18,36,.95)',titleColor:'#e2e8f0',bodyColor:'#94a3b8',borderColor:'rgba(139,92,246,.3)',borderWidth:1}},
          scales:{
            x:{grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#64748b',font:{size:10}}},
            y:{beginAtZero:true,grid:{color:'rgba(255,255,255,.04)'},ticks:{color:'#64748b',font:{size:10},stepSize:1}}
          }
        }
      });

      // roles donut
      if(cR)cR.destroy();
      cR=new Chart(document.getElementById('chartRoles'),{
        type:'doughnut',
        data:{
          labels:['Students','Teachers','Admins'],
          datasets:[{
            data:[data.counts.students,data.counts.teachers,data.counts.admins],
            backgroundColor:['rgba(6,182,212,.75)','rgba(139,92,246,.75)','rgba(239,68,68,.75)'],
            borderColor:['#06b6d4','#8b5cf6','#ef4444'],
            borderWidth:2,hoverOffset:10
          }]
        },
        options:{responsive:true,maintainAspectRatio:false,cutout:'68%',
          plugins:{
            legend:{position:'bottom',labels:{color:'#94a3b8',font:{size:11},padding:14,boxWidth:12}},
            tooltip:{backgroundColor:'rgba(14,18,36,.95)',titleColor:'#e2e8f0',bodyColor:'#94a3b8',borderColor:'rgba(139,92,246,.3)',borderWidth:1}
          }
        }
      });

      // recent users list
      const ul=document.getElementById('recentUsersList');
      if(!data.recentUsers?.length){
        ul.innerHTML='<div class="empty-msg">No users yet</div>';
      }else{
        ul.innerHTML=data.recentUsers.map(u=>`
          <div class="data-row">
            <span class="dr-label">${esc(u.name)}</span>
            <span class="rb ${(u.role||'').toLowerCase()}">${u.role||'?'}</span>
            <span class="dr-meta">${timeAgo(u.createdAt)}</span>
          </div>`).join('');
      }

      // plan breakdown
      const pl=document.getElementById('planList');
      if(!data.planBreakdown?.length){
        pl.innerHTML='<div class="empty-msg">No active subscriptions</div>';
      }else{
        const mx=Math.max(...data.planBreakdown.map(p=>p.count),1);
        pl.innerHTML=data.planBreakdown.map(p=>`
          <div class="plan-row">
            <span class="plan-name">${esc(p.plan)}</span>
            <span class="plan-count">${p.count} users</span>
            <span class="plan-rev">R${fmt(p.monthlyRevenue)}/mo</span>
            <div class="plan-bar-wrap">
              <div class="plan-bar" style="width:${Math.round(p.count/mx*100)}%"></div>
            </div>
          </div>`).join('');
      }

      // game sessions
      const sl=document.getElementById('recentSessionsList');
      if(!data.recentSessions?.length){
        sl.innerHTML='<div class="empty-msg">No game sessions yet</div>';
      }else{
        sl.innerHTML=data.recentSessions.map(s=>`
          <div class="data-row">
            <span class="dr-label">Code: <strong>${esc(s.code)}</strong></span>
            <span class="rb ${(s.status||'').toLowerCase()}">${s.status||'?'}</span>
            <span class="dr-meta">${timeAgo(s.createdAt)}</span>
          </div>`).join('');
      }

    }catch(err){
      document.getElementById('dbStatus').innerHTML='<span class="dot r"></span> DB Unavailable';
      console.warn('Admin stats error:',err.message);
    }
  }

  function fmt(n){return Number(n||0).toLocaleString();}
  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function timeAgo(iso){
    if(!iso)return'';
    const s=Math.floor((Date.now()-new Date(iso))/1000);
    if(s<60)return s+'s ago';
    if(s<3600)return Math.floor(s/60)+'m ago';
    if(s<86400)return Math.floor(s/3600)+'h ago';
    return Math.floor(s/86400)+'d ago';
  }
</script>
</body>
</html>"""

with open(r"C:\Users\acer\OneDrive\Documents\frontend\finsished front end\Testing2-SlidePlay\admin-dashboard.html", "w", encoding="utf-8") as f:
    f.write(html)
print("Done:", len(html), "chars written")
