console.log('Hello World12');

// Пример кода с потенциальными проблемами
function dangerous() {
  var x = document.innerHTML;
  eval(x);
  return x + undefined;
}

// Неоптимальная функция
function inefficient(arr) {
    
  for (let i = 0; i < arr.length; i++) {
    for (let j = 0; j < arr.length; j++) {
      console.log(arr[i] + arr[j]);
    }
  }
}

// Проблема с памятью
const bigArray = new Array(1000000).fill(0);
setInterval(() => {
  bigArray.push(Math.random());
}, 1);
