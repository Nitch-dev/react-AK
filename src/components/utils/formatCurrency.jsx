// Format number in Indian comma system (lakhs and crores)
export function formatIndianCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '₹0';
  
  const num = parseFloat(amount);
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  
  const [integerPart, decimalPart] = absNum.toFixed(2).split('.');
  
  if (integerPart.length <= 3) {
    return `₹${isNegative ? '-' : ''}${integerPart}.${decimalPart}`;
  }
  
  const lastThree = integerPart.slice(-3);
  const remaining = integerPart.slice(0, -3);
  const formatted = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
  
  return `₹${isNegative ? '-' : ''}${formatted}.${decimalPart}`;
}