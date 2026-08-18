import { adapterForCurrentHost } from './adapters';
import { FloaterController } from './controller';

const adapter = adapterForCurrentHost();
if (adapter) {
  const controller = new FloaterController(adapter);
  void controller.start();
}
