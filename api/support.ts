import client from "./client";

export type ContactContent = {
  title?: string;
  supportEmail?: string;
  supportPhone?: string;
  whatsappNumber?: string;
  businessHours?: string;
  address?: string;
  message?: string;
};

export type SupportRequestPayload = {
  name?: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
};

export async function getContactContent(): Promise<ContactContent> {
  return client.get("/support/contact").then((res) => res.data.contact);
}

export async function submitSupportRequest(
  payload: SupportRequestPayload,
): Promise<{ success: boolean; requestId?: string; message?: string }> {
  return client
    .post("/support/contact-requests", payload)
    .then((res) => res.data);
}
