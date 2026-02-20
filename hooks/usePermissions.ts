import * as Camera from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export interface PermissionStatuses {
    camera: boolean;
    microphone: boolean;
    location: boolean;
    notifications: boolean;
    allGranted: boolean;
}

export function usePermissions(): PermissionStatuses {
    const [statuses, setStatuses] = useState<PermissionStatuses>({
        camera: false,
        microphone: false,
        location: false,
        notifications: false,
        allGranted: false,
    });

    useEffect(() => {
        requestAll();
    }, []);

    const requestAll = async () => {
        let cam = false;
        let mic = false;
        let loc = false;
        let notif = false;

        // Camera
        try {
            const camResult = await Camera.requestCameraPermissionsAsync();
            cam = camResult.status === 'granted';
        } catch (e) {
            console.warn('Camera permission error:', e);
        }

        // Microphone
        try {
            const micResult = await Camera.requestMicrophonePermissionsAsync();
            mic = micResult.status === 'granted';
        } catch (e) {
            console.warn('Microphone permission error:', e);
        }

        // Location
        try {
            const locResult = await Location.requestForegroundPermissionsAsync();
            loc = locResult.status === 'granted';
        } catch (e) {
            console.warn('Location permission error:', e);
        }

        // Notifications (not applicable on web)
        if (Platform.OS !== 'web') {
            try {
                const { status: existingStatus } = await Notifications.getPermissionsAsync();
                let finalStatus = existingStatus;
                if (existingStatus !== 'granted') {
                    const { status } = await Notifications.requestPermissionsAsync();
                    finalStatus = status;
                }
                notif = finalStatus === 'granted';
            } catch (e) {
                console.warn('Notification permission error:', e);
            }
        } else {
            notif = true; // Web doesn't need this permission flow
        }

        setStatuses({
            camera: cam,
            microphone: mic,
            location: loc,
            notifications: notif,
            allGranted: cam && mic && loc && notif,
        });
    };

    return statuses;
}
