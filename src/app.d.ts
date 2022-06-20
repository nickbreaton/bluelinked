/// <reference types="@sveltejs/kit" />

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare namespace App {
	interface Locals {
		client: import('bluelinky').default<
			import('bluelinky/dist/controllers/american.controller').AmericanBlueLinkyConfig,
			'US',
			import('bluelinky/dist/vehicles/american.vehicle').default
		>;
		vehicle: import('bluelinky/dist/vehicles/american.vehicle').default;
	}

	// interface Platform {}
	// interface Session {}
	// interface Stuff {}
}

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			SHARED_SECRET: string;
			BLUELINK_USERNAME: string;
			BLUELINK_PASSWORD: string;
			BLUELINK_PIN: string;
		}
	}
}
