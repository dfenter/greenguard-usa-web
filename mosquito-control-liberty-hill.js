(function(){
  var x=new XMLHttpRequest();
  x.open('GET','https://greenguard-usa.github.io/greenguard-usa-web/mosquito-control-liberty-hill.html?v='+Date.now(),false);
  x.send();
  if(x.status===200){
    var d=document.createElement('div');
    d.innerHTML=x.responseText;
    var h=d.querySelector('style');
    var b=d.querySelector('body')||d;
    if(h)document.head.appendChild(h);
    document.write(b.innerHTML);
  }
})();