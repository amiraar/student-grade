let capturedImageOriginalDataUrl = null;
let capturedImageDataUrl = null;
let calibrationPoints = [];
let calibrationActive = false;
let activeSection = 'pg';
let keyRows = {pg:[],bs:[],mj:[]};
let stream = null;

function switchTab(t){
  document.getElementById('pane-upload').style.display = t==='upload'?'block':'none';
  document.getElementById('pane-camera').style.display = t==='camera'?'block':'none';
  document.getElementById('tab-upload').className = 'tab'+(t==='upload'?' active':'');
  document.getElementById('tab-camera').className = 'tab'+(t==='camera'?' active':'');
  if(t!=='camera'&&stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
}

function switchSection(s){
  ['pg','bs','mj'].forEach(x=>{
    document.getElementById('section-'+x).style.display=x===s?'block':'none';
    document.getElementById('stab-'+x).className='stab'+(x===s?' on':'');
  });
  activeSection=s;
}

function addKeyRow(sec, num, val){
  const rows = document.getElementById('key-'+sec+'-rows');
  const n = num || (rows.children.length+1);
  const placeholder=sec==='bs'?'B/S':sec==='mj'?'A-K':'A-D';
  const div = document.createElement('div');
  div.className='key-row';
  div.innerHTML=`<label>${n}.</label><input type="text" maxlength="3" placeholder="${placeholder}" value="${val||''}">`;
  rows.appendChild(div);
}

function removeKeyRow(sec){
  const rows = document.getElementById('key-'+sec+'-rows');
  if(rows.children.length>0){
    rows.removeChild(rows.lastElementChild);
  }
}

function initDefaultKeys(){
  for(let i=1;i<=15;i++) addKeyRow('pg',i,'');
  for(let i=1;i<=5;i++) addKeyRow('bs',i,'');
  for(let i=1;i<=5;i++) addKeyRow('mj',i,'');
}

function getKeys(){
  const result={};
  ['pg','bs','mj'].forEach(sec=>{
    const inputs=[...document.getElementById('key-'+sec+'-rows').querySelectorAll('input')];
    result[sec]=inputs.map((inp,i)=>({num:i+1,answer:inp.value.trim().toUpperCase()}));
  });
  return result;
}

function handleFileUpload(e){
  const file=e.target.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    capturedImageOriginalDataUrl=ev.target.result;
    capturedImageDataUrl=ev.target.result;
    setPreviewImage(ev.target.result,'Gambar siap dianalisis (mode OMR)');
    document.getElementById('preview-wrap').style.display='block';
    document.getElementById('grade-btn').disabled=false;
  };
  reader.readAsDataURL(file);
}

async function startCamera(){
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
    const v=document.getElementById('cam-video');
    v.srcObject=stream;
    v.classList.add('active');
    document.getElementById('cam-placeholder').style.display='none';
    document.getElementById('snap-btn').disabled=false;
  }catch(err){
    alert('Tidak bisa mengakses kamera: '+err.message);
  }
}

function snapPhoto(){
  const v=document.getElementById('cam-video');
  const c=document.getElementById('snap-canvas');
  c.width=v.videoWidth;c.height=v.videoHeight;
  c.getContext('2d').drawImage(v,0,0);
  const dataURL=c.toDataURL('image/jpeg',0.92);
  capturedImageOriginalDataUrl=dataURL;
  capturedImageDataUrl=dataURL;
  setPreviewImage(dataURL,'Foto diambil — siap dikoreksi (mode OMR)');
  document.getElementById('preview-wrap').style.display='block';
  switchTab('upload');
  document.getElementById('grade-btn').disabled=false;
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
}

async function gradeExam(){
  if(!capturedImageDataUrl){alert('Pilih gambar terlebih dahulu');return;}
  const keys=getKeys();
  const hasKey=Object.values(keys).some(arr=>arr.some(r=>r.answer));
  if(!hasKey){alert('Isi minimal satu kunci jawaban');return;}

  document.getElementById('grade-btn').style.display='none';
  document.getElementById('loading').style.display='block';
  document.getElementById('result-area').style.display='none';

  try{
    const parsed=await runOmrFromDataUrl(capturedImageDataUrl,keys);
    showResult(parsed,keys);
  }catch(err){
    document.getElementById('loading').style.display='none';
    document.getElementById('grade-btn').style.display='block';
    document.getElementById('result-area').style.display='block';
    document.getElementById('result-area').innerHTML=`<p style="color:var(--err);font-size:13px">Gagal menganalisis: ${err.message}</p>`;
  }
}

function getOmrLayout(){
  return {
    pg:{
      options:['A','B','C','D'],
      blocks:[
        {startX:0.10,startY:0.18,rowGap:0.045,colGap:0.06,count:5},
        {startX:0.41,startY:0.18,rowGap:0.045,colGap:0.06,count:5},
        {startX:0.72,startY:0.18,rowGap:0.045,colGap:0.06,count:5}
      ]
    },
    bs:{
      options:['B','S'],
      blocks:[
        {startX:0.10,startY:0.55,rowGap:0.05,colGap:0.06,count:5}
      ]
    },
    mj:{
      options:['A','B','C','D','E','F','G','H','I','J','K'],
      blocks:[
        {startX:0.28,startY:0.70,rowGap:0.05,colGap:0.055,count:5}
      ]
    }
  };
}

async function runOmrFromDataUrl(dataUrl,keys){
  const img=await loadImage(dataUrl);
  const c=document.getElementById('snap-canvas');
  c.width=img.width;
  c.height=img.height;
  const ctx=c.getContext('2d');
  ctx.drawImage(img,0,0);
  const imageData=ctx.getImageData(0,0,c.width,c.height);
  const contrastNote=checkContrast(imageData,c.width,c.height);
  const layout=getOmrLayout();
  const radius=Math.max(6,Math.round(Math.min(c.width,c.height)*0.008));
  const baseThreshold=6;
  const gap=4;

  const noteParts=[];
  const result={pg:[],bs:[],mj:[],catatan:''};
  if(contrastNote){noteParts.push(contrastNote);}

  const labels={pg:'PG',bs:'BS',mj:'MJ'};
  ['pg','bs','mj'].forEach(sec=>{
    const secLayout=layout[sec];
    const answers=analyzeSection(imageData,c.width,c.height,secLayout,radius,baseThreshold,gap,noteParts,labels[sec]);
    result[sec]=answers.map((ans,i)=>({
      no:i+1,
      jawaban_siswa:ans,
      benar:ans!=='-'&&ans===keys[sec][i].answer
    }));
  });

  if(noteParts.length){
    result.catatan=noteParts.join(' | ');
  }
  return result;
}

function analyzeSection(imageData,w,h,layout,radius,baseThreshold,gap,noteParts,label){
  const answers=[];
  const blocks=layout.blocks||[layout];
  blocks.forEach(block=>{
    const options=block.options||layout.options||[];
    for(let i=0;i<block.count;i++){
      const y=Math.round(block.startY*h + i*block.rowGap*h);
      const scores=options.map((opt,idx)=>{
        const x=Math.round(block.startX*w + idx*block.colGap*w);
        const sample=sampleBubble(imageData,w,h,x,y,radius);
        return {opt,fillScore:sample.fillScore};
      });
      const rowStats=getStats(scores.map(s=>s.fillScore));
      const adaptiveThreshold=Math.max(baseThreshold,rowStats.mean+rowStats.std*0.8);
      scores.sort((a,b)=>b.fillScore-a.fillScore);
      const best=scores[0];
      const runner=scores[1]||{fillScore:0};
      if(best.fillScore<adaptiveThreshold||best.fillScore-runner.fillScore<gap){
        answers.push('-');
        continue;
      }
      answers.push(best.opt);
    }
  });
  const emptyCount=answers.filter(a=>a==='-').length;
  if(emptyCount>0){
    noteParts.push(`Bagian ${label}: ${emptyCount} kosong/tidak terbaca`);
  }
  return answers;
}

function sampleBubble(imageData,w,h,cx,cy,r){
  const {data}=imageData;
  let sumInner=0,countInner=0;
  let sumRing=0,countRing=0;
  const rInner=r;
  const rOuter=Math.round(r*1.6);
  const rInner2=rInner*rInner;
  const rOuter2=rOuter*rOuter;
  const x0=Math.max(0,cx-rOuter),x1=Math.min(w-1,cx+rOuter);
  const y0=Math.max(0,cy-rOuter),y1=Math.min(h-1,cy+rOuter);
  for(let y=y0;y<=y1;y++){
    for(let x=x0;x<=x1;x++){
      const dx=x-cx,dy=y-cy;
      const d2=dx*dx+dy*dy;
      if(d2>rOuter2)continue;
      const idx=(y*w+x)*4;
      const rC=data[idx],gC=data[idx+1],bC=data[idx+2];
      const gray=(rC*0.299+gC*0.587+bC*0.114);
      if(d2<=rInner2){
        sumInner+=gray;countInner++;
      }else{
        sumRing+=gray;countRing++;
      }
    }
  }
  const innerAvg=countInner?sumInner/countInner:255;
  const ringAvg=countRing?sumRing/countRing:255;
  const fillScore=Math.max(0,ringAvg-innerAvg);
  return {fillScore,innerAvg,ringAvg};
}

function getStats(values){
  const n=values.length||1;
  const mean=values.reduce((a,b)=>a+b,0)/n;
  const variance=values.reduce((a,b)=>a+(b-mean)*(b-mean),0)/n;
  const std=Math.sqrt(variance);
  return {mean,std};
}

function checkContrast(imageData,w,h){
  const {data}=imageData;
  let sum=0,sum2=0,count=0;
  const step=4;
  for(let y=0;y<h;y+=step){
    for(let x=0;x<w;x+=step){
      const idx=(y*w+x)*4;
      const rC=data[idx],gC=data[idx+1],bC=data[idx+2];
      const gray=(rC*0.299+gC*0.587+bC*0.114);
      sum+=gray;sum2+=gray*gray;count++;
    }
  }
  const mean=sum/count;
  const variance=sum2/count-mean*mean;
  const std=Math.sqrt(Math.max(0,variance));
  if(std<18){
    return 'Kontras rendah, hasil bisa kurang akurat';
  }
  return '';
}

function loadImage(dataUrl){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('Gagal memuat gambar'));
    img.src=dataUrl;
  });
}

function downloadTemplate(){
  const w=1000,h=1414;
  const c=document.createElement('canvas');
  c.width=w;c.height=h;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#111';
  ctx.font='24px Arial';
  ctx.fillText('Template OMR - Koreksi Ujian',80,60);
  ctx.font='14px Arial';
  ctx.fillText('Isi bulatan dengan pensil/pena hitam',80,84);

  const layout=getOmrLayout();
  drawSectionTemplate(ctx,w,h,layout.pg,'Pilihan Ganda (A-E)');
  drawSectionTemplate(ctx,w,h,layout.bs,'Benar / Salah (B/S)');
  drawSectionTemplate(ctx,w,h,layout.mj,'Menjodohkan (A-E)');

  const link=document.createElement('a');
  link.download='template_omr_koreksi_ujian.png';
  link.href=c.toDataURL('image/png');
  link.click();
}

function setupCalibrationCanvas(){
  calibrationPoints=[];
  calibrationActive=false;
  document.getElementById('calib-help').textContent='Klik 4 sudut: kiri atas, kanan atas, kanan bawah, kiri bawah.';
  const canvas=document.getElementById('calibration-canvas');
  const img=document.getElementById('preview-img');
  const rect=img.getBoundingClientRect();
  canvas.width=Math.max(1,Math.round(rect.width));
  canvas.height=Math.max(1,Math.round(rect.height));
  canvas.style.pointerEvents='none';
  drawCalibrationOverlay();
}

function startCalibration(){
  if(!capturedImageOriginalDataUrl){return;}
  calibrationPoints=[];
  calibrationActive=true;
  const canvas=document.getElementById('calibration-canvas');
  canvas.style.pointerEvents='auto';
  document.getElementById('calib-help').textContent='Klik 4 sudut secara berurutan.';
  canvas.onclick=handleCalibrationClick;
  drawCalibrationOverlay();
}

function resetCalibration(){
  if(!capturedImageOriginalDataUrl){return;}
  calibrationPoints=[];
  calibrationActive=false;
  capturedImageDataUrl=capturedImageOriginalDataUrl;
  setPreviewImage(capturedImageDataUrl,'Kalibrasi direset ke gambar asli');
  const canvas=document.getElementById('calibration-canvas');
  canvas.onclick=null;
  canvas.style.pointerEvents='none';
}

async function autoCropDeskew(){
  if(!capturedImageOriginalDataUrl){return;}
  const img=await loadImage(capturedImageOriginalDataUrl);
  const tmp=document.getElementById('snap-canvas');
  tmp.width=img.width;tmp.height=img.height;
  const ctx=tmp.getContext('2d');
  ctx.drawImage(img,0,0);
  const imageData=ctx.getImageData(0,0,tmp.width,tmp.height);
  const box=detectPaperBox(imageData,tmp.width,tmp.height);
  if(!box){
    document.getElementById('detect-note').textContent='Auto-crop gagal, coba kalibrasi manual';
    return;
  }
  calibrationPoints=[
    {x:box.x0,y:box.y0},
    {x:box.x1,y:box.y0},
    {x:box.x1,y:box.y1},
    {x:box.x0,y:box.y1}
  ];
  await applyCalibration();
  document.getElementById('detect-note').textContent='Auto-crop + deskew selesai';
}

function handleCalibrationClick(ev){
  if(!calibrationActive)return;
  const canvas=ev.currentTarget;
  const rect=canvas.getBoundingClientRect();
  const x=ev.clientX-rect.left;
  const y=ev.clientY-rect.top;
  const img=document.getElementById('preview-img');
  const scaleX=img.naturalWidth/rect.width;
  const scaleY=img.naturalHeight/rect.height;
  calibrationPoints.push({x:x*scaleX,y:y*scaleY});
  drawCalibrationOverlay();
  if(calibrationPoints.length===4){
    calibrationActive=false;
    canvas.onclick=null;
    canvas.style.pointerEvents='none';
    applyCalibration();
  }
}

function drawCalibrationOverlay(){
  const canvas=document.getElementById('calibration-canvas');
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!calibrationPoints.length)return;
  const img=document.getElementById('preview-img');
  if(!img.naturalWidth||!img.naturalHeight)return;
  const rect=img.getBoundingClientRect();
  const scaleX=rect.width/img.naturalWidth;
  const scaleY=rect.height/img.naturalHeight;
  ctx.strokeStyle='#1a6ef5';
  ctx.fillStyle='rgba(26,110,245,0.2)';
  ctx.lineWidth=2;
  ctx.font='12px Arial';
  const pts=calibrationPoints.map(p=>({x:p.x*scaleX,y:p.y*scaleY}));
  pts.forEach((p,i)=>{
    ctx.beginPath();
    ctx.arc(p.x,p.y,5,0,Math.PI*2);
    ctx.fill();
    ctx.fillStyle='#1a6ef5';
    ctx.fillText(String(i+1),p.x+6,p.y-6);
    ctx.fillStyle='rgba(26,110,245,0.2)';
  });
  if(pts.length>1){
    ctx.beginPath();
    ctx.moveTo(pts[0].x,pts[0].y);
    for(let i=1;i<pts.length;i++){ctx.lineTo(pts[i].x,pts[i].y);} 
    ctx.stroke();
  }
}

function setPreviewImage(dataUrl,note){
  const img=document.getElementById('preview-img');
  img.onload=()=>setupCalibrationCanvas();
  img.src=dataUrl;
  if(note){document.getElementById('detect-note').textContent=note;}
}

async function applyCalibration(){
  if(calibrationPoints.length!==4){return;}
  const img=await loadImage(capturedImageOriginalDataUrl);
  const srcCanvas=document.createElement('canvas');
  srcCanvas.width=img.width;srcCanvas.height=img.height;
  const srcCtx=srcCanvas.getContext('2d');
  srcCtx.drawImage(img,0,0);
  const dstSize={w:1000,h:1414};
  const warped=warpPerspective(srcCanvas,calibrationPoints,dstSize.w,dstSize.h);
  capturedImageDataUrl=warped.toDataURL('image/jpeg',0.92);
  setPreviewImage(capturedImageDataUrl,'Kalibrasi diterapkan');
}

function detectPaperBox(imageData,w,h){
  const {data}=imageData;
  let sum=0,sum2=0,count=0;
  const step=4;
  for(let y=0;y<h;y+=step){
    for(let x=0;x<w;x+=step){
      const idx=(y*w+x)*4;
      const rC=data[idx],gC=data[idx+1],bC=data[idx+2];
      const gray=(rC*0.299+gC*0.587+bC*0.114);
      sum+=gray;sum2+=gray*gray;count++;
    }
  }
  const mean=sum/count;
  const variance=sum2/count-mean*mean;
  const std=Math.sqrt(Math.max(0,variance));
  const threshold=Math.min(245,mean+std*0.6);
  let x0=w,y0=h,x1=0,y1=0,hit=0;
  for(let y=0;y<h;y+=2){
    for(let x=0;x<w;x+=2){
      const idx=(y*w+x)*4;
      const rC=data[idx],gC=data[idx+1],bC=data[idx+2];
      const gray=(rC*0.299+gC*0.587+bC*0.114);
      if(gray>=threshold){
        if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y;
        hit++;
      }
    }
  }
  if(hit<1000)return null;
  const pad=10;
  return {x0:Math.max(0,x0-pad),y0:Math.max(0,y0-pad),x1:Math.min(w-1,x1+pad),y1:Math.min(h-1,y1+pad)};
}

function warpPerspective(srcCanvas,srcPts,dstW,dstH){
  const dstCanvas=document.createElement('canvas');
  dstCanvas.width=dstW;dstCanvas.height=dstH;
  const dstCtx=dstCanvas.getContext('2d');
  const srcCtx=srcCanvas.getContext('2d');
  const srcData=srcCtx.getImageData(0,0,srcCanvas.width,srcCanvas.height);
  const dstData=dstCtx.createImageData(dstW,dstH);

  const dstPts=[{x:0,y:0},{x:dstW-1,y:0},{x:dstW-1,y:dstH-1},{x:0,y:dstH-1}];
  const H=computeHomography(dstPts,srcPts);
  const sw=srcCanvas.width,sh=srcCanvas.height;

  for(let y=0;y<dstH;y++){
    for(let x=0;x<dstW;x++){
      const map=applyHomography(H,x,y);
      const sx=map.x,sy=map.y;
      const di=(y*dstW+x)*4;
      if(sx<0||sy<0||sx>=sw-1||sy>=sh-1){
        dstData.data[di+3]=255;
        continue;
      }
      const c=bilinearSample(srcData,sw,sh,sx,sy);
      dstData.data[di]=c.r;
      dstData.data[di+1]=c.g;
      dstData.data[di+2]=c.b;
      dstData.data[di+3]=255;
    }
  }
  dstCtx.putImageData(dstData,0,0);
  return dstCanvas;
}

function computeHomography(srcPts,dstPts){
  const A=[];
  for(let i=0;i<4;i++){
    const x=srcPts[i].x,y=srcPts[i].y;
    const X=dstPts[i].x,Y=dstPts[i].y;
    A.push([x,y,1,0,0,0,-x*X,-y*X,X]);
    A.push([0,0,0,x,y,1,-x*Y,-y*Y,Y]);
  }
  const h=gaussianSolve(A);
  return [
    [h[0],h[1],h[2]],
    [h[3],h[4],h[5]],
    [h[6],h[7],h[8]]
  ];
}

function gaussianSolve(A){
  const n=8;
  for(let i=0;i<n;i++){
    let maxRow=i;
    for(let k=i+1;k<n;k++){
      if(Math.abs(A[k][i])>Math.abs(A[maxRow][i]))maxRow=k;
    }
    const tmp=A[i];A[i]=A[maxRow];A[maxRow]=tmp;
    const pivot=A[i][i]||1e-10;
    for(let j=i;j<=n;j++){A[i][j]/=pivot;}
    for(let k=0;k<n;k++){
      if(k===i)continue;
      const factor=A[k][i];
      for(let j=i;j<=n;j++){A[k][j]-=factor*A[i][j];}
    }
  }
  const h=A.map(r=>r[n]);
  h.push(1);
  return h;
}

function applyHomography(H,x,y){
  const denom=H[2][0]*x+H[2][1]*y+H[2][2];
  const nx=(H[0][0]*x+H[0][1]*y+H[0][2])/denom;
  const ny=(H[1][0]*x+H[1][1]*y+H[1][2])/denom;
  return {x:nx,y:ny};
}

function bilinearSample(imageData,w,h,x,y){
  const x0=Math.floor(x),y0=Math.floor(y);
  const x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1);
  const dx=x-x0,dy=y-y0;
  const c00=getPixel(imageData,w,x0,y0);
  const c10=getPixel(imageData,w,x1,y0);
  const c01=getPixel(imageData,w,x0,y1);
  const c11=getPixel(imageData,w,x1,y1);
  const r=lerp(lerp(c00.r,c10.r,dx),lerp(c01.r,c11.r,dx),dy);
  const g=lerp(lerp(c00.g,c10.g,dx),lerp(c01.g,c11.g,dx),dy);
  const b=lerp(lerp(c00.b,c10.b,dx),lerp(c01.b,c11.b,dx),dy);
  return {r:Math.round(r),g:Math.round(g),b:Math.round(b)};
}

function getPixel(imageData,w,x,y){
  const idx=(y*w+x)*4;
  const d=imageData.data;
  return {r:d[idx],g:d[idx+1],b:d[idx+2]};
}

function lerp(a,b,t){
  return a+(b-a)*t;
}

function drawSectionTemplate(ctx,w,h,layout,title){
  const blocks=layout.blocks||[layout];
  const options=(layout.options||[]);
  const first=blocks[0];
  ctx.fillStyle='#111';
  ctx.font='16px Arial';
  ctx.fillText(title,Math.round(first.startX*w)-70,Math.round(first.startY*h)-18);
  ctx.font='12px Arial';
  const r=7;
  ctx.strokeStyle='#222';
  blocks.forEach((block,blockIndex)=>{
    const blockOptions=block.options||options;
    blockOptions.forEach((opt,idx)=>{
      const x=Math.round(block.startX*w + idx*block.colGap*w);
      const y=Math.round(block.startY*h - 6);
      ctx.fillText(opt,x-4,y);
    });
    for(let i=0;i<block.count;i++){
      const y=Math.round(block.startY*h + i*block.rowGap*h);
      ctx.fillStyle='#111';
      ctx.fillText(String(i+1+blockIndex*block.count).padStart(2,'0'),Math.round(block.startX*w)-45,y+4);
      blockOptions.forEach((opt,idx)=>{
        const x=Math.round(block.startX*w + idx*block.colGap*w);
        ctx.beginPath();
        ctx.arc(x,y,r,0,Math.PI*2);
        ctx.stroke();
      });
    }
  });
}

function showResult(data,keys){
  document.getElementById('loading').style.display='none';
  document.getElementById('grade-btn').style.display='block';

  const allSections=[
    {key:'pg',label:'Pilihan Ganda',items:data.pg||[]},
    {key:'bs',label:'Benar/Salah',items:data.bs||[]},
    {key:'mj',label:'Menjodohkan',items:data.mj||[]}
  ];

  let totalBenar=0,totalSoal=0;
  allSections.forEach(sec=>{
    sec.items.forEach(item=>{
      const kunci=keys[sec.key].find(k=>k.num===item.no);
      if(kunci&&kunci.answer){
        totalSoal++;
        if(item.benar)totalBenar++;
      }
    });
  });

  const pct=totalSoal>0?Math.round((totalBenar/totalSoal)*100):0;
  const nilai=Math.round(pct);
  const grade=nilai>=90?'A':nilai>=80?'B':nilai>=70?'C':nilai>=60?'D':'E';

  let html=`
    <div style="margin-bottom:16px">
      <div class="score-row">
        <span class="big-score">${nilai}</span>
        <div>
          <span class="grade-badge grade-${grade}">${grade}</span>
          <p class="score-info" style="margin-top:4px">${totalBenar} benar dari ${totalSoal} soal</p>
        </div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span class="info-pill">${pct}% skor</span>
    </div>
  `;

  allSections.forEach(sec=>{
    const filtered=sec.items.filter(item=>keys[sec.key].find(k=>k.num===item.no&&k.answer));
    if(!filtered.length)return;
    const benar=filtered.filter(i=>i.benar).length;
    html+=`<div style="margin-bottom:14px">
      <p style="font-size:12px;font-weight:500;color:var(--ink2);margin-bottom:6px">${sec.label} — ${benar}/${filtered.length}</p>
      <div class="answer-grid">`;
    filtered.forEach(item=>{
      const kunci=keys[sec.key].find(k=>k.num===item.no);
      const cls=item.jawaban_siswa==='-'?'empty':item.benar?'correct':'wrong';
      html+=`<div class="ans-item ${cls}">
        <span class="ans-num">No ${item.no}</span>
        <span class="ans-detail">${item.jawaban_siswa} ${item.benar?'✓':'✗ ('+((kunci&&kunci.answer)||'?')+')' }</span>
      </div>`;
    });
    html+='</div></div>';
  });

  if(data.catatan){
    html+=`<p style="font-size:11px;color:var(--ink3);margin-top:8px;font-family:var(--mono)">Catatan: ${data.catatan}</p>`;
  }

  const area=document.getElementById('result-area');
  area.innerHTML=html;
  area.style.display='block';
  area.scrollIntoView({behavior:'smooth',block:'start'});
}

initDefaultKeys();
