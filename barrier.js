(function(){
  var url='https://greenguard-usa.github.io/greenguard-usa-web/barrier.html?v='+Date.now();
  fetch(url).then(function(r){return r.text();}).then(function(html){
    var parser=new DOMParser();
    var doc=parser.parseFromString(html,'text/html');
    doc.querySelectorAll('style,link').forEach(function(el){
      document.head.appendChild(document.importNode(el,true));
    });
    var frag=document.createDocumentFragment();
    Array.from(doc.body.childNodes).forEach(function(el){
      frag.appendChild(document.importNode(el,true));
    });
    document.body.appendChild(frag);
    document.body.querySelectorAll('script').forEach(function(s){
      var ns=document.createElement('script');
      ns.textContent=s.textContent;
      s.parentNode.replaceChild(ns,s);
    });
  }).catch(function(e){console.error('GreenGuard load error:',e);});
})();
