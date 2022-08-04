import { PRIVATE_STATIC } from 'virtual:svelte-kit-virtual-private-env';
import { env } from '$env/dynamic/private';

export function GET() {
	return {
		body: {
			PRIVATE_STATIC,
			PRIVATE_DYNAMIC: env.PRIVATE_DYNAMIC
		}
	};
}
