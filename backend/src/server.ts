import { env } from './config/env';
import { createApp } from './app';
createApp().listen(env.PORT, () => console.log(`API listening on :${env.PORT}`));
