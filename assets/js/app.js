let capturedImageOriginalDataUrl = null;
let capturedImageDataUrl = null;
let calibrationPoints = [];
let calibrationActive = false;
let activeSection = 'pg';
let keyRows = {pg:[],bs:[],mj:[]};
let stream = null;
let sessionResults = [];
let lastResult = null;

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
  div.innerHTML=`<label>${n}.</label><div class="key-input-wrap"><input type="text" maxlength="3" placeholder="${placeholder}" value="${val||''}"><span class="key-error"></span></div>`;
  rows.appendChild(div);
  const input=div.querySelector('input');
  input.addEventListener('input',()=>{
    input.value=input.value.toUpperCase();
    div.classList.remove('invalid');
    const err=div.querySelector('.key-error');
    if(err){err.textContent='';}
  });
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

function validateKeysAndShowErrors(){
  const rules={
    pg:/^[ABCD]$/,
    bs:/^[BS]$/,
    mj:/^[A-K]$/
  };
  let valid=true;
  ['pg','bs','mj'].forEach(sec=>{
    const rows=[...document.getElementById('key-'+sec+'-rows').children];
    rows.forEach((row,idx)=>{
      const input=row.querySelector('input');
      const err=row.querySelector('.key-error');
      const raw=input.value.trim().toUpperCase();
      input.value=raw;
      if(!raw){
        row.classList.remove('invalid');
        if(err){err.textContent='';}
        return;
      }
      if(!rules[sec].test(raw)){
        valid=false;
        row.classList.add('invalid');
        if(err){err.textContent=`No. ${idx+1}: jawaban tidak valid`;}
      }else{
        row.classList.remove('invalid');
        if(err){err.textContent='';}
      }
    });
  });
  return valid;
}

function getWeights(){
  const pg=parseFloat(document.getElementById('weight-pg').value||'0');
  const bs=parseFloat(document.getElementById('weight-bs').value||'0');
  const mj=parseFloat(document.getElementById('weight-mj').value||'0');
  return {pg,bs,mj};
}

function validateWeights(){
  const err=document.getElementById('weight-error');
  const w=getWeights();
  const sum=w.pg+w.bs+w.mj;
  if(!Number.isFinite(sum)||Math.round(sum)!==100){
    err.textContent='Total bobot harus 100.';
    return false;
  }
  err.textContent='';
  return true;
}

function setupWeightInputs(){
  ['weight-pg','weight-bs','weight-mj'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.addEventListener('input',()=>{
      validateWeights();
    });
  });
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
  if(!validateKeysAndShowErrors()){
    alert('Periksa kunci jawaban yang tidak valid');
    return;
  }
  if(!validateWeights()){
    alert('Periksa bobot nilai terlebih dahulu');
    return;
  }
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

  const meta={doubleMarks:{pg:0,bs:0,mj:0},missingKey:{pg:0,bs:0,mj:0}};
  const labels={pg:'PG',bs:'BS',mj:'MJ'};
  ['pg','bs','mj'].forEach(sec=>{
    const secLayout=layout[sec];
    const analysis=analyzeSection(imageData,c.width,c.height,secLayout,radius,baseThreshold,gap,noteParts,labels[sec]);
    meta.doubleMarks[sec]=analysis.doubleCount;
    let missingKeyCount=0;
    result[sec]=analysis.answers.map((ans,i)=>{
      const keyEntry=keys[sec]&&keys[sec][i]&&keys[sec][i].answer?keys[sec][i].answer:'';
      const keyMissing=ans!=='-'&&!keyEntry;
      if(keyMissing){missingKeyCount++;}
      return {
        no:i+1,
        jawaban_siswa:ans,
        keyMissing
      };
    });
    meta.missingKey[sec]=missingKeyCount;
    if(missingKeyCount>0){
      noteParts.push(`Bagian ${labels[sec]}: ${missingKeyCount} jawaban terdeteksi tanpa kunci, tidak dinilai`);
    }
  });

  if(noteParts.length){
    result.catatan=noteParts.join(' | ');
  }
  result.meta=meta;
  return result;
}

function analyzeSection(imageData,w,h,layout,radius,baseThreshold,gap,noteParts,label){
  const answers=[];
  let doubleCount=0;
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
      if(runner.fillScore>=best.fillScore*0.7){
        answers.push('!!');
        doubleCount++;
      }else{
        answers.push(best.opt);
      }
    }
  });
  const emptyCount=answers.filter(a=>a==='-').length;
  if(emptyCount>0){
    noteParts.push(`Bagian ${label}: ${emptyCount} kosong/tidak terbaca`);
  }
  if(doubleCount>0){
    noteParts.push(`Bagian ${label}: ${doubleCount} double mark`);
  }
  return {answers,doubleCount,emptyCount};
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
  ctx.fillStyle='#000';
  const fiducials=[
    {x:40,y:40},
    {x:960,y:40},
    {x:960,y:1374},
    {x:40,y:1374}
  ];
  fiducials.forEach(p=>{
    ctx.beginPath();
    ctx.arc(p.x,p.y,12,0,Math.PI*2);
    ctx.fill();
  });
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
  const fiducials=detectFiducials(imageData,tmp.width,tmp.height);
  if(fiducials){
    calibrationPoints=fiducials;
    await applyCalibration();
    document.getElementById('detect-note').textContent='Fiducial terdeteksi';
    return;
  }
  document.getElementById('detect-note').textContent='Fiducial tidak ditemukan, menggunakan auto-crop';
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

function detectFiducials(imageData,w,h){
  const marginX=Math.round(w*0.1);
  const marginY=Math.round(h*0.1);
  const radius=Math.max(8,Math.round(Math.min(w,h)*0.012));
  const step=Math.max(2,Math.round(radius/3));
  const regions=[
    {key:'tl',x0:0,y0:0,x1:marginX,y1:marginY},
    {key:'tr',x0:w-marginX,y0:0,x1:w-1,y1:marginY},
    {key:'br',x0:w-marginX,y0:h-marginY,x1:w-1,y1:h-1},
    {key:'bl',x0:0,y0:h-marginY,x1:marginX,y1:h-1}
  ];
  const points={};
  for(const region of regions){
    let best={x:region.x0,y:region.y0,gray:255};
    for(let y=region.y0;y<=region.y1;y+=step){
      for(let x=region.x0;x<=region.x1;x+=step){
        const idx=(y*w+x)*4;
        const d=imageData.data;
        const gray=d[idx]*0.299+d[idx+1]*0.587+d[idx+2]*0.114;
        if(gray<best.gray){
          best={x,y,gray};
        }
      }
    }
    const sample=sampleBubble(imageData,w,h,best.x,best.y,radius);
    const contrast=Math.max(0,sample.ringAvg-sample.innerAvg);
    const darkness=Math.max(0,200-sample.innerAvg);
    const confidence=Math.min(1,contrast/80)*Math.min(1,darkness/120);
    if(confidence<0.7){
      return null;
    }
    points[region.key]={x:best.x,y:best.y};
  }
  return [points.tl,points.tr,points.br,points.bl];
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

function buildKeyMap(keys,sec){
  const map={};
  (keys[sec]||[]).forEach(k=>{
    if(k.answer){map[k.num]=k.answer;}
  });
  return map;
}

function redistributeWeights(weights,totals){
  const totalWeight=weights.pg+weights.bs+weights.mj;
  const active=['pg','bs','mj'].filter(k=>totals[k]>0);
  const activeSum=active.reduce((sum,k)=>sum+weights[k],0);
  if(activeSum<=0){
    return {pg:0,bs:0,mj:0};
  }
  const factor=totalWeight/activeSum;
  return {
    pg:totals.pg>0?weights.pg*factor:0,
    bs:totals.bs>0?weights.bs*factor:0,
    mj:totals.mj>0?weights.mj*factor:0
  };
}

function csvEscape(val){
  const str=String(val??'');
  if(/[";\n]/.test(str)){
    return `"${str.replace(/"/g,'""')}"`;
  }
  return str;
}

function buildCurrentCsv(data,keys,name,finalScore){
  const rows=[];
  rows.push(['Nama Siswa','Seksi','No Soal','Jawaban Siswa','Kunci','Status','Nilai Akhir']);
  const sections=[
    {key:'pg',label:'Pilihan Ganda',items:data.pg||[]},
    {key:'bs',label:'Benar/Salah',items:data.bs||[]},
    {key:'mj',label:'Menjodohkan',items:data.mj||[]}
  ];
  sections.forEach(sec=>{
    const keyMap=buildKeyMap(keys,sec.key);
    sec.items.forEach(item=>{
      const keyAnswer=keyMap[item.no]||'';
      let status='';
      if(item.jawaban_siswa==='!!'){
        status='Double Mark';
      }else if(item.jawaban_siswa==='-'){
        status='Tidak Terbaca';
      }else if(!keyAnswer){
        status='Tidak Terbaca';
      }else{
        status=item.jawaban_siswa===keyAnswer?'Benar':'Salah';
      }
      rows.push([
        name||'',
        sec.label,
        item.no,
        item.jawaban_siswa,
        keyAnswer,
        status,
        finalScore
      ]);
    });
  });
  return rows.map(r=>r.map(csvEscape).join(';')).join('\n');
}

function downloadCsv(filename,csvText){
  const blob=new Blob([csvText],{type:'text/csv;charset=utf-8;'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download=filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadCsvCurrent(){
  if(!lastResult)return;
  const csv=buildCurrentCsv(lastResult.data,lastResult.keys,lastResult.name,lastResult.finalScore);
  downloadCsv('hasil_omr.csv',csv);
}

function renderSessionList(){
  const area=document.getElementById('session-area');
  if(!sessionResults.length){
    area.style.display='none';
    return;
  }
  let html=`
    <div class="session-head">
      <div class="session-title">Daftar Hasil Sesi Ini</div>
      <div class="result-actions">
        <button class="action-btn" onclick="downloadAllSessionsCsv()">Unduh Semua (CSV)</button>
        <button class="action-btn" onclick="clearSessionList()">Hapus Sesi</button>
      </div>
    </div>
    <table class="session-table">
      <thead>
        <tr><th>No</th><th>Nama</th><th>Nilai</th><th>Grade</th><th>Waktu</th></tr>
      </thead>
      <tbody>
  `;
  sessionResults.forEach((row,idx)=>{
    html+=`<tr>
      <td>${idx+1}</td>
      <td>${row.nama}</td>
      <td>${row.nilai}</td>
      <td>${row.grade}</td>
      <td>${row.waktu}</td>
    </tr>`;
  });
  html+='</tbody></table>';
  area.innerHTML=html;
  area.style.display='block';
}

function downloadAllSessionsCsv(){
  if(!sessionResults.length)return;
  const rows=[['No','Nama','Nilai','Grade','Waktu']];
  sessionResults.forEach((row,idx)=>{
    rows.push([idx+1,row.nama,row.nilai,row.grade,row.waktu]);
  });
  const csv=rows.map(r=>r.map(csvEscape).join(';')).join('\n');
  downloadCsv('hasil_sesi_omr.csv',csv);
}

function clearSessionList(){
  sessionResults=[];
  renderSessionList();
}

function showResult(data,keys){
  document.getElementById('loading').style.display='none';
  document.getElementById('grade-btn').style.display='block';

  const allSections=[
    {key:'pg',label:'Pilihan Ganda',items:data.pg||[]},
    {key:'bs',label:'Benar/Salah',items:data.bs||[]},
    {key:'mj',label:'Menjodohkan',items:data.mj||[]}
  ];

  const totals={pg:0,bs:0,mj:0};
  const stats={pg:{correct:0,wrong:0,empty:0,double:0},bs:{correct:0,wrong:0,empty:0,double:0},mj:{correct:0,wrong:0,empty:0,double:0}};

  allSections.forEach(sec=>{
    const keyMap=buildKeyMap(keys,sec.key);
    sec.items.forEach(item=>{
      const keyAnswer=keyMap[item.no];
      if(!keyAnswer){
        return;
      }
      totals[sec.key]++;
      if(item.jawaban_siswa==='-'){
        stats[sec.key].empty++;
      }else if(item.jawaban_siswa==='!!'){
        stats[sec.key].double++;
      }else if(item.jawaban_siswa===keyAnswer){
        stats[sec.key].correct++;
      }else{
        stats[sec.key].wrong++;
      }
    });
  });

  const weights=getWeights();
  const effectiveWeights=redistributeWeights(weights,totals);
  const finalScore=(
    (totals.pg?stats.pg.correct/totals.pg:0)*effectiveWeights.pg+
    (totals.bs?stats.bs.correct/totals.bs:0)*effectiveWeights.bs+
    (totals.mj?stats.mj.correct/totals.mj:0)*effectiveWeights.mj
  );
  const nilai=Math.round(finalScore);
  const totalBenar=stats.pg.correct+stats.bs.correct+stats.mj.correct;
  const totalSoal=totals.pg+totals.bs+totals.mj;
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
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.max(0,Math.min(100,nilai))}%"></div></div>
      <span class="info-pill">${Math.max(0,Math.min(100,nilai))}% skor</span>
    </div>
  `;

  allSections.forEach(sec=>{
    const keyMap=buildKeyMap(keys,sec.key);
    const filtered=sec.items.filter(item=>keyMap[item.no]||item.keyMissing);
    if(!filtered.length)return;
    const s=stats[sec.key];
    html+=`<div style="margin-bottom:14px">
      <p style="font-size:12px;font-weight:500;color:var(--ink2);margin-bottom:6px">${sec.label}</p>
      <div class="section-summary">
        <span class="summary-pill ok">${s.correct} benar</span>
        <span class="summary-pill bad">${s.wrong} salah</span>
        <span class="summary-pill muted">${s.empty} tidak terbaca</span>
        <span class="summary-pill warn">${s.double} double-mark</span>
      </div>
      <div class="answer-grid">`;
    filtered.forEach(item=>{
      const keyAnswer=keyMap[item.no]||'';
      let cls='';
      let detail='';
      if(item.keyMissing){
        cls='unscored';
        detail=`${item.jawaban_siswa} (kunci kosong)`;
      }else if(item.jawaban_siswa==='-'){
        cls='empty';
        detail='- (tidak terbaca)';
      }else if(item.jawaban_siswa==='!!'){
        cls='double';
        detail='!! (double mark)';
      }else if(item.jawaban_siswa===keyAnswer){
        cls='correct';
        detail=`${item.jawaban_siswa} ✓`;
      }else{
        cls='wrong';
        detail=`${item.jawaban_siswa} ✗ (${keyAnswer})`;
      }
      html+=`<div class="ans-item ${cls}">
        <span class="ans-num">No ${item.no}</span>
        <span class="ans-detail">${detail}</span>
      </div>`;
    });
    html+='</div></div>';
  });

  html+=`<div class="result-actions">
    <button class="action-btn primary" onclick="downloadCsvCurrent()">Unduh CSV</button>
  </div>`;

  if(data.catatan){
    html+=`<p style="font-size:11px;color:var(--ink3);margin-top:8px;font-family:var(--mono)">Catatan: ${data.catatan}</p>`;
  }

  const area=document.getElementById('result-area');
  area.innerHTML=html;
  area.style.display='block';
  area.scrollIntoView({behavior:'smooth',block:'start'});

  const namaInput=document.getElementById('student-name');
  const nama=namaInput?namaInput.value.trim():'-';
  lastResult={data,keys,name:nama,finalScore:nilai};
  const waktu=new Date().toLocaleString('id-ID',{hour12:false});
  sessionResults.push({nama:nama||'-',nilai:nilai,grade,waktu});
  renderSessionList();
}

initDefaultKeys();
setupWeightInputs();