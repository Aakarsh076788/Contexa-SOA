export function discordCanManage(message) {
  return Boolean(message.guildId && message.member?.permissions?.has('ManageGuild'));
}
export function telegramCanManage(chatType, memberStatus, senderId) {
  if (chatType === 'private') return Boolean(senderId);
  return ['administrator', 'creator'].includes(memberStatus);
}
