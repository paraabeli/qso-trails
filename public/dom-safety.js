'use strict';
(()=>{
  const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
  if(!descriptor?.set||!descriptor?.get)return;
  Object.defineProperty(HTMLSelectElement.prototype,'innerHTML',{
    configurable:true,
    get(){return descriptor.get.call(this);},
    set(value){
      const html=String(value??'');
      const options=[];
      const re=/<option(?:\s+value="([^"]*)")?>([^<]*)<\/option>/gi;
      let match,last=0;
      while((match=re.exec(html))){
        if(html.slice(last,match.index).trim())throw new TypeError('Unsafe select markup rejected.');
        options.push({value:match[1]??match[2],label:match[2]});
        last=re.lastIndex;
      }
      if(html.slice(last).trim())throw new TypeError('Unsafe select markup rejected.');
      this.replaceChildren(...options.map(item=>new Option(item.label,item.value)));
    }
  });
})();
