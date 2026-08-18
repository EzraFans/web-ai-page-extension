import { adapterForCurrentHost } from './adapters';
import { FloaterController } from './controller';

const adapter = adapterForCurrentHost();
if (adapter) {
  const controller = new FloaterController(adapter);
  void controller.start();
} else {
  // 理论上不会走到（manifest matches 只含已适配站点），留着排查域名变更/重定向
  console.log('[wpx] 当前站点无适配器，跳过注入:', location.hostname);
}
