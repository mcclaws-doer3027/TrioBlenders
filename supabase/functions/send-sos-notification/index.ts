// Supabase Edge Function: send-sos-notification
// Deploy with: npx supabase functions deploy send-sos-notification
//
// This function is invoked by the citizen SOS screen when an alert is created.
// It fetches all push tokens from profiles and sends a notification via
// the Expo Push Notification API.

import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req: Request) => {
    try {
        const { alert_id, lat, lng } = await req.json();

        if (!alert_id) {
            return new Response(JSON.stringify({ error: 'alert_id is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Create a Supabase client using the service role key (available in functions env)
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        // Fetch all push tokens from profiles (citizens + police)
        const { data: profiles, error } = await supabaseAdmin
            .from('profiles')
            .select('push_token, role')
            .not('push_token', 'is', null);

        if (error) {
            console.error('Error fetching profiles:', error);
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const tokens = (profiles ?? [])
            .map((p: any) => p.push_token)
            .filter(Boolean) as string[];

        if (tokens.length === 0) {
            return new Response(JSON.stringify({ message: 'No push tokens found' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Build Expo push message payload
        const messages = tokens.map((token: string) => ({
            to: token,
            sound: 'default',
            title: '🚨 SOS ALERT — HX-12',
            body: `Emergency triggered nearby. Lat: ${lat?.toFixed(4)}, Lng: ${lng?.toFixed(4)}`,
            data: { alert_id, lat, lng },
            priority: 'high',
            channelId: 'sos-alerts',
        }));

        // Send to Expo Push API in chunks of 100 (their limit)
        const chunkSize = 100;
        const results = [];
        for (let i = 0; i < messages.length; i += chunkSize) {
            const chunk = messages.slice(i, i + chunkSize);
            const res = await fetch(EXPO_PUSH_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify(chunk),
            });
            const data = await res.json();
            results.push(data);
        }

        return new Response(JSON.stringify({ success: true, sent: tokens.length, results }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err: any) {
        console.error('Edge function error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});
