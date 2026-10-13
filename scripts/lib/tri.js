function clipP(P,ax,v,s){const out=[];for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],da=s*(a[ax]-v),db=s*(b[ax]-v);
 if(da>=0)out.push(a);
 if((da>=0)!==(db>=0)){const t=(v-a[ax])/(b[ax]-a[ax]),p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];p[ax]=v;out.push(p);}}
 return out;}
function unwrapRing(ring,ref){const out=[];let off=0,prev=ring[0][0];for(const p of ring){let x=p[0]+off;while(x-prev>180){off-=360;x-=360;}while(prev-x>180){off+=360;x+=360;}prev=x;out.push([x,p[1]]);}
 {const F=out[0],Lp=out[out.length-1];if(Math.abs(Lp[0]-F[0])>180){const pole=(F[1]+Lp[1])<0?-90:90;out.push([Lp[0],pole],[F[0],pole]);}}
 if(ref!==undefined){const d=Math.round((ref-out[0][0])/360);if(d)for(const p of out)p[0]+=360*d;}return out;}
function unwrapPoly(poly){const o=unwrapRing(poly[0]);return [o].concat(poly.slice(1).map(r=>unwrapRing(r,o[0][0])));}
async function triangulate(feats,earcut,STEP,tick,idOf){
 const LL=[],ID=[],IDX=[],PL=[];let nv=0;
 const addV=(x,y,id)=>{LL.push(x,y);ID.push(id);return nv++;};
 for(let fi=0;fi<feats.length;fi++){
  const id=idOf?idOf[fi]:fi+1,g=feats[fi].geometry,polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
  for(const rp of polys){
   const flat=[],holes=[],base=nv;const poly=unwrapPoly(rp);
   poly.forEach((ring,ri)=>{if(ri)holes.push(flat.length/2);for(const pt of ring){flat.push(pt[0],pt[1]);addV(pt[0],pt[1],id);}});
   let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
   for(const pt of poly[0]){x0=Math.min(x0,pt[0]);x1=Math.max(x1,pt[0]);y0=Math.min(y0,pt[1]);y1=Math.max(y1,pt[1]);}
   PL.push({id,bb:[x0,y0,x1,y1],poly});
   const tri=earcut(flat,holes);
   for(let t=0;t<tri.length;t+=3){
    const a=tri[t],b=tri[t+1],c=tri[t+2];
    const ax=flat[2*a],ay=flat[2*a+1],bx=flat[2*b],by=flat[2*b+1],cx=flat[2*c],cy=flat[2*c+1];
    const i0=Math.floor(Math.min(ax,bx,cx)/STEP),i1=Math.floor(Math.max(ax,bx,cx)/STEP),j0=Math.floor(Math.min(ay,by,cy)/STEP),j1=Math.floor(Math.max(ay,by,cy)/STEP);
    if(i0===i1&&j0===j1){IDX.push(base+a,base+b,base+c);continue;}
    for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){
     let P=[[ax,ay],[bx,by],[cx,cy]];
     P=clipP(P,0,i*STEP,1);if(P.length<3)continue;P=clipP(P,0,(i+1)*STEP,-1);if(P.length<3)continue;
     P=clipP(P,1,j*STEP,1);if(P.length<3)continue;P=clipP(P,1,(j+1)*STEP,-1);if(P.length<3)continue;
     const v0=addV(P[0][0],P[0][1],id);let pv=addV(P[1][0],P[1][1],id);
     for(let k=2;k<P.length;k++){const cu=addV(P[k][0],P[k][1],id);IDX.push(v0,pv,cu);pv=cu;}
    }
   }
  }
  if(tick&&fi%8===7)await tick();
 }
 return {ll:new Float32Array(LL),id:new Uint16Array(ID),idx:new Uint32Array(IDX),PL};
}
// scripts/build_tris.js evaluates this file; the editor imports it to triangulate subdivisions as they load
if(typeof module!=='undefined')module.exports={triangulate};
