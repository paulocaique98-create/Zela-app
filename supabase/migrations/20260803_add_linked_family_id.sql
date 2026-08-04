ALTER TABLE public.users ADD COLUMN linked_family_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
