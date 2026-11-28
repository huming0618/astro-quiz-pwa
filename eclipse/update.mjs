// Loaded by every lesson entry, not only by the quiz home page.
const build='20261128-r8',root=new URL('../',import.meta.url);
const previous=navigator.serviceWorker?.controller;
let reloading=false;
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(previous&&!reloading){
      reloading=true;
      const key=`astro-eclipse-reload-${build}`;
      try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');}catch{}
      location.reload();
    }
  });
  navigator.serviceWorker.register(new URL('sw.js',root).href,{scope:root.pathname,updateViaCache:'none'})
    .then(registration=>registration.update()).catch(error=>console.warn('页面更新检查失败；不影响计算',error));
}
