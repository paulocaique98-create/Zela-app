-- Corrige a function do Kiosk para usar a coluna is_active em vez de status
CREATE OR REPLACE FUNCTION get_kiosk_school_id() RETURNS uuid AS $$
DECLARE
    kiosk_token text;
    k_school_id uuid;
BEGIN
    -- Obter o token customizado do header via PostgREST
    kiosk_token := current_setting('request.headers', true)::json->>'x-kiosk-token';
    IF kiosk_token IS NOT NULL THEN
        -- Validar se o token existe e está ativo na tabela kiosk_devices (usando is_active = true)
        SELECT school_id INTO k_school_id 
        FROM kiosk_devices 
        WHERE device_token = kiosk_token 
        AND is_active = true;
        
        RETURN k_school_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
