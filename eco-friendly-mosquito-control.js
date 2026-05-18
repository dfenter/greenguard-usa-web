(function(){
  var x=new XMLHttpRequest();
  x.open('GET','https://greenguard-usa.github.io/greenguard-usa-web/eco-friendly-mosquito-control.html?v='+Date.now(),false);
  x.send();
  if(x.status===200){
    var d=document.createElement('div');
    d.innerHTML=x.responseText;
    var h=d.querySelector('style');
    var l=d.querySelector('link');
    var b=d.querySelector('body')||d;
    if(h)document.head.appendChild(h);
    if(l)document.head.appendChild(l);
    document.write(b.innerHTML);
  }
})();