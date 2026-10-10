import * as FileSystem from 'expo-file-system/legacy';

const ORDER_FILE = (FileSystem.documentDirectory || '') + 'ip_rail_orders.json';

type RailOrders = Record<string, number[]>;

let cachedOrders: RailOrders | null = null;

export async function loadIpRailOrders(): Promise<RailOrders> {
  if (cachedOrders) return cachedOrders;
  try {
    const info = await FileSystem.getInfoAsync(ORDER_FILE);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(ORDER_FILE);
      cachedOrders = JSON.parse(content);
      return cachedOrders || {};
    }
  } catch (error) {
    console.warn('Failed to load IP rail orders', error);
  }
  cachedOrders = {};
  return cachedOrders;
}

export function getIpRailOrdersSync(): RailOrders {
  return cachedOrders || {};
}

export async function saveIpRailOrder(railId: string, order: number[]) {
  try {
    const orders = await loadIpRailOrders();
    orders[railId] = order;
    cachedOrders = orders;
    await FileSystem.writeAsStringAsync(ORDER_FILE, JSON.stringify(orders));
  } catch (error) {
    console.warn('Failed to save IP rail order', error);
  }
}

export function sortIpsByOrder<T extends { id: number }>(ips: T[], order: number[]): T[] {
  if (!order || order.length === 0) return ips;
  
  const ipMap = new Map<number, T>();
  ips.forEach(ip => ipMap.set(ip.id, ip));
  
  const sorted: T[] = [];
  // First add items that are in the order array
  order.forEach(id => {
    if (ipMap.has(id)) {
      sorted.push(ipMap.get(id)!);
      ipMap.delete(id);
    }
  });
  
  // Then append any new items not in the order array
  ipMap.forEach(ip => sorted.push(ip));
  
  return sorted;
}
